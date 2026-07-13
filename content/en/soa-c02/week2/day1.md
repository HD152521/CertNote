# Day 1 - CloudWatch Metrics Internal Structure: Namespace, Dimension, Resolution, Cardinality

When you open the CloudWatch console, you're overwhelmed by an endless pile of graphs. EC2 CPU, ELB Request Count, Lambda Duration, RDS Connections, ECS CPU Reservation... An operator must judge "is our service down right now" in 5 seconds. To do that, you need to understand how metrics are stored, indexed, and billed. If you only memorize the UI, after a few minutes you'll lose the graphs, and when the bill arrives, you'll encounter a cardinality explosion.

Today we explore the **data model, time resolution, retention policy, cardinality pitfalls, and cost structure** of CloudWatch Metrics from an operator's perspective. In exams, it frequently appears as decision scenarios like "should we enable detailed monitoring or go to 1-second resolution?" or "should we track latency per user as a dimension?"

## CloudWatch Metrics Data Model

A single metric data point is identified by a tuple of 6 elements.

```
DataPoint = (Namespace, MetricName, Dimensions[], Timestamp, Value, Unit)
```

| Element | Example | Meaning |
|---------|---------|---------|
| **Namespace** | `AWS/EC2`, `AWS/RDS`, `MyApp/Production` | Metric container. AWS service or custom (may contain `/`) |
| **MetricName** | `CPUUtilization`, `RequestCount` | Name of measured value |
| **Dimensions** | `InstanceId=i-abc`, `Env=Prod` | Key=value pairs identifying the metric (max 30 per metric) |
| **Timestamp** | 2025-05-26T14:30:00Z | Measurement time (millisecond precision) |
| **Value** | 75.0 | Single value or statistic set (`{Sum, Min, Max, SampleCount}`) |
| **Unit** | `Percent`, `Milliseconds`, `Bytes` | Unit. CloudWatch supports some unit conversions |

**Key fact**: `(Namespace, MetricName, the exact set of Dimensions)` is treated as a **unique metric**. So even with a single name `CPUUtilization`, if you have 100 EC2 instances, 100 separate metrics exist (differing `InstanceId` dimension values). To see the average across 100 instances, you must aggregate separately using Math Expression's `AVG(METRICS())` or the console's "Add math" feature.

> 🔍 **Deeper context**: CloudWatch is built on what's reportedly similar to OpenTSDB/Druid time-series DB. Metrics are indexed by `(namespace, metric_name, normalized hash of dimension_set)` for fast lookup. However, dimension combinations explode, creating hundreds of thousands of different metrics with the same metric_name, causing exponential cost and query latency growth. This is called **cardinality explosion** — a trap in Prometheus, InfluxDB, and Datadog too. CloudWatch charges $0.30 per metric/month (first 10,000), so adding one wrong dimension multiplies your bill by thousands.

> ⚠️ **Pitfall**: The common antipattern "let's add `user_id` as a Dimension to track per-user latency." If you have 1 million users, you generate 1 million metrics costing $300,000/month(!). Per-user analysis belongs in **logs (Logs Insights)**, **OpenSearch**, or **EMF metadata fields** (regular log fields, not metric dimensions). If you see "per-user / per-request analysis" keywords on the exam, custom metric dimensions are almost always wrong.

## Time Resolution: Standard vs High-Resolution

CloudWatch metrics are stored at one of two resolutions.

| Resolution | Data point interval | Alarm evaluation min frequency | Cost | When to use |
|------------|---------------------|--------------------------------|------|-------------|
| **Standard (60s)** | 1 minute | Evaluable at 10s intervals but data is 1-minute | Standard | Most workloads |
| **High-Resolution (1s)** | 1 second | 10s or 30s alarms possible | Standard + 1.5x alarm cost ($0.30/metric unchanged) | Fast auto-scaling, 30s-1min spikes |

AWS standard metrics default to 60s resolution (EC2 requires detailed monitoring for 1-min; otherwise 5-min). Custom metrics enable 1-second resolution via `StorageResolution=1` on `PutMetricData`.

```bash
# Publish 1-second resolution metric — StorageResolution=1
aws cloudwatch put-metric-data \
  --namespace "MyApp/Realtime" \
  --metric-data \
    "MetricName=ActiveSessions,Value=4823,Unit=Count,StorageResolution=1"
```

> 📚 **Case study**: A gaming company ran a workload with traffic spikes lasting only 30 seconds per minute. On standard 60-second metrics, the 30-second spike was buried in the 1-minute average, causing ASG to respond late (threshold crossed only after half the spike ended). After switching to 1-second resolution + Step Scaling, spike detection time dropped from 60s to 10s. Cost is $0.30/metric/month (high-resolution doesn't raise the per-metric rate; alarm cost is 1.5x), but preventing lost instances from 5xx errors instantly justified the ROI.

> 🔍 **Deeper context**: High-Resolution metrics have the same retention window (15 months) but **automatically aggregate to lower resolution over time**. 1-second resolution is kept for 3 hours only, then aggregated to 60-second, then to 5-minute after 15 days, then to 1-hour after 63 days. So 1-second data from a year ago is not queryable. For long-term retention, export via GetMetricData or stream to Kinesis Firehose → S3 via CloudWatch Metric Stream.

## Metric Retention Policy: 4-Step Auto Down-Sampling Staircase

```
[Resolution]      1s     →    60s    →    5min   →   1hour   →  (delete)
[Retention]      3h        15d         63d       15mo
            ─────────────────────────────────────────────►  
```

Facts operators must memorize:

- **After 3 hours, 1-second data disappears** (aggregated to 60-second)
- **After 15 days, 1-minute data disappears** (aggregated to 5-minute)
- **After 63 days, 5-minute data disappears** (aggregated to 1-hour)
- **After 15 months (455 days), data is permanently deleted**

For long-term retention, use **CloudWatch Metric Stream → Kinesis Firehose → S3** (GA'd 2021), or periodic GetMetricData export. If you author quarterly/annual SLO and SLI reports, data must be archived in S3.

> 💡 **Related theory**: Implementation of the time-series DB standard pattern **roll-up / down-sampling**. Prometheus `recording rules` + remote write to Thanos, Graphite storage-aggregation, InfluxDB continuous queries, and RRDtool RRA (Round Robin Archive) all use the same concept. Data volume decreases over time because "recent data precise, old data broad" reflects operational reality. SLO analysis uses a standard 28-30 day window, making this policy sufficient for most cases.

## EC2 Detailed Monitoring vs Basic Monitoring

EC2 provides basic **Basic Monitoring** at 5-minute intervals for free. **Detailed Monitoring** (per-minute metrics) costs approximately $2.10/instance/month (7 metrics × $0.30).

| Metric | Basic (5min) | Detailed (1min) | CloudWatch Agent (guest OS) |
|--------|--------------|-----------------|------------------------------|
| CPUUtilization | ✅ | ✅ | (duplicate) |
| NetworkIn/Out, NetworkPacketsIn/Out | ✅ | ✅ | - |
| DiskReadOps/WriteOps, DiskReadBytes/WriteBytes | ✅ | ✅ | - |
| EBSReadOps/WriteOps (Nitro) | ✅ | ✅ | - |
| StatusCheckFailed, StatusCheckFailed_System/Instance | ✅ | ✅ | - |
| **MemoryUtilization (mem_used_percent)** | ❌ | ❌ | ✅ |
| **DiskSpaceUtilization (disk_used_percent)** | ❌ | ❌ | ✅ |
| **SwapUtilization** | ❌ | ❌ | ✅ |
| **TCPv4 EstablishedConn, NetStat** | ❌ | ❌ | ✅ |

> ⚠️ **Pitfall**: Memory and disk usage don't appear even with EC2 detailed monitoring enabled. These must be measured inside the guest OS, so **CloudWatch Agent is required**. On exams, scenarios like "alarm on EC2 memory usage" or "alert before disk fills" almost always answer with CloudWatch Agent. Another frequent pitfall: "Auto Scaling can't scale based on memory" → You must have ASG target tracking pointing to a custom metric published by the Agent.

> 🔍 **Deeper context**: EC2 measures CPU, network, and disk I/O at the hypervisor level (currently Nitro System). So it works regardless of guest OS and persists even if the guest hangs. But memory requires OS-level page table and cache statistics inaccessible from the hypervisor. For the same reason, disk "usage" (filesystem level, df -h) is invisible — EBS read/write IOPS (block device level) are visible. This trade-off is inherent to IaaS; with ECS Fargate/Lambda, AWS operates the guest OS so memory is a standard metric.

### Core CloudWatch Agent Installation Commands

```bash
# Install Agent via SSM (operator standard)
aws ssm send-command \
  --document-name "AWS-ConfigureAWSPackage" \
  --parameters action=Install,name=AmazonCloudWatchAgent \
  --targets "Key=tag:Env,Values=Prod"

# Save Agent config in Parameter Store, then fetch
aws ssm put-parameter \
  --name "/cloudwatch-agent/prod/config" \
  --value file://amazon-cloudwatch-agent.json \
  --type String

# Start Agent
aws ssm send-command \
  --document-name "AmazonCloudWatch-ManageAgent" \
  --parameters action=configure,mode=ec2,\
optionalConfigurationSource=ssm,\
optionalConfigurationLocation=/cloudwatch-agent/prod/config,\
optionalRestart=yes \
  --targets "Key=tag:Env,Values=Prod"
```

This pattern is the answer to the frequent exam scenario "bulk deploy memory metrics across hundreds of EC2 instances." SSM Run Command + Parameter Store combination.

## Custom Metrics: PutMetricData Cost Pitfalls

To publish metrics directly from an application, use `PutMetricData` API. Common pattern operators encounter:

```bash
# Publish metric via CLI — single data point
aws cloudwatch put-metric-data \
  --namespace "MyApp/Production" \
  --metric-name "OrderProcessingLatency" \
  --value 234 \
  --unit Milliseconds \
  --dimensions "Service=Checkout,Env=Prod" \
  --storage-resolution 60

# Publish as aggregated statistics (StatisticValues) — reduces API call cost
aws cloudwatch put-metric-data \
  --namespace "MyApp/Production" \
  --metric-name "OrderProcessingLatency" \
  --statistic-values \
    "Sum=12450,Minimum=120,Maximum=890,SampleCount=53" \
  --unit Milliseconds \
  --dimensions "Service=Checkout,Env=Prod"
```

Cost structure:

- **PutMetricData API calls**: $0.01 per 1,000 calls ($0.00001 per call)
- **Metric storage**: $0.30 per metric/month (first 10,000), lower rates for higher volumes
- **GetMetricData**: $0.01 per 1,000 metric-seconds

> 📚 **Case study**: A company called `PutMetricData` for every HTTP request to record response time (3 metrics × ~100M calls/day average). After a month, the CloudWatch Metrics API bill alone was $8,000. **Solution: Embed metrics in logs using Embedded Metric Format (EMF) → CloudWatch auto-extracts** (EMF has 0 API calls). Cost dropped 95%. EMF depth covered on Week 2 Day 4.

> 🔍 **Deeper context**: `PutMetricData` accepts max 1,000 data points + 1MB payload per call. When publishing metrics directly, always batch to minimize call count. API call cost often exceeds metric storage cost. Using `StatisticValues` to publish only per-minute aggregated results (one set of `Sum/Min/Max/SampleCount` instead of N raw data points) reduces calls 60-fold. But percentiles require raw values, so if you want p99, you must publish raw.

## Statistic vs ExtendedStatistic: The Lie of Averages

Multiple statistics can be extracted from the same metric.

| Statistic | Meaning | When operator uses |
|-----------|---------|---------------------|
| **Sum** | Total | Total requests, total errors, cumulative throughput |
| **Average** | Mean | CPU/memory average (watch for hidden long tail) |
| **Minimum/Maximum** | Min/Max | Extreme value alarms, "even one instance hits 100%" |
| **SampleCount** | Number of data points | Detect missing data |
| **p50, p90, p95, p99, p99.9** | Percentiles (Extended Statistic) | Latency distribution long tail |
| **TM(percent)** | Trimmed Mean | Mean excluding extremes. Removes outlier influence |
| **WM, PR, TC, TS** | Wins Mean, Percentile Rank, Trimmed Count, Trimmed Sum | Sophisticated statistics |

> ⚠️ **Pitfall**: Deciding "Lambda average response time is 200ms so we're stable" is dangerous. If 1% of requests take 5 seconds, p99 is 5,000ms — 1% of users get a terrible experience. **Operators watch p95, p99, not average**. Exam scenarios about "monitoring user experience long tail" almost always answer with percentile statistics. Defining SLO by average is practically equivalent to having no SLO.

> 💡 **Related theory**: Latency long tails are "Power Law" distribution outcome. Pareto's 19th-century 80/20 rule applies to latency distribution. Gil Tene's "How NOT to Measure Latency" talk (Strange Loop 2015) is required reading for operators — explains Coordinated Omission pitfall and why averages lie. AWS SLOs define latency as "p99 < N ms"; average rarely appears in SLOs.

## Math Expression: Combining and Deriving Metrics

Multiple metrics can be combined in a single graph or alarm. CloudWatch's **Math Expression**.

```
m1 = ALBRequestCount (Sum, 1min)
m2 = ALBTargetResponseTime (Average, 1min)
m3 = ALBHTTPCode_Target_5XX_Count (Sum, 1min)

e1 = m1 * m2                    # Total response time (summed latency)
e2 = m1 / 60                    # Requests per second (RPS)
e3 = (m3 / m1) * 100            # 5xx error rate (%)
e4 = ANOMALY_DETECTION_BAND(e3, 2)  # ML-based dynamic baseline
```

Frequently used patterns:

- **Error rate** = `(5xxCount / RequestCount) * 100`
- **RPS** = `RequestCount / 60`
- **Average across instances** = `AVG(METRICS())`
- **Sum across instances** = `SUM(METRICS())`
- **Anomaly band** = `ANOMALY_DETECTION_BAND(m1, 2)` (±2 standard deviations)
- **fill** = `FILL(m1, 0)` (fill gaps with 0)
- **rate of change** = `RATE(m1)` (change per unit time; converts cumulative counters to RPS)

> 🔍 **Deeper context**: Math Expression also feeds directly into alarms. "Alert when 5xx error rate exceeds 5%" can't be expressed with a single metric (numerator and denominator differ). Compute the ratio with Math Expression and set threshold on that expression result. Alarm's `Metrics` field lists `[m1, m2, e1]`, and one expression with `ReturnData=true` feeds the alarm. Console "Add math" menu adds it; the expression ID becomes the alarm identifier.

## Anomaly Detection: ML-Based Dynamic Baseline

Fixed-threshold alarms (e.g., CPU > 80%) suffer from false positive explosions on workloads with time-varying patterns. **Anomaly Detection** learns daily/weekday/hourly patterns to generate dynamic baselines.

```
                            [Anomaly Detection Band]
  ┌──────── upper band ────────────────────
  │   ╭╮                ╭─╮       ╭╮       
  │  ╱  ╲    ╭╮       ╱   ╲     ╱  ╲      
  │ ╱    ╲╱╲╱  ╲────── ╱   ╲   ╱    ╲  ──── learned mean
  │                      ╲   ╲ ╱      ╲
  └──────── lower band ────────────────────

  Alarm when metric goes outside band
```

CloudWatch learns from the last 2 weeks (14 days) of data to build an STL/ARIMA regression model. Model training takes 5-15 minutes, **retrains hourly** to adapt to pattern changes. Operators need only specify standard deviation multiplier (usually 2 or 3).

> 💡 **Related theory**: This is a cloud implementation of **STL (Seasonal-Trend decomposition using LOESS)** (Cleveland et al., 1990, *Journal of Official Statistics*) or **ARIMA (AutoRegressive Integrated Moving Average)** models. Same family as Facebook Prophet (Taylor & Letham, 2017), Twitter AnomalyDetection (2015), Netflix Surus, LinkedIn Luminol. ML replaces manual per-time-of-day threshold adjustment.

> 📚 **Case study**: An e-commerce company had traffic peaks at noon and 7pm daily, with different weekend patterns. Fixed thresholds generated dozens of false positives daily, causing overnight page-outs. After Anomaly Detection, normal patterns (lunch/dinner peaks, weekend dips) didn't trigger alarms, only unexpected traffic shifts (Black Friday, outages, bot attacks) triggered correctly. Overnight alerts dropped 80%.

> ⚠️ **Pitfall**: Anomaly Detection requires **minimum 2 days, reliably 2 weeks of accumulated data before applying**. On new metrics, instant application causes learning shortage, marking nearly all data points as anomalies. Exam scenarios: "newly applied anomaly detection on new service, false alarms spiked" → Answer: "enable after data accumulation."

## CloudWatch Metric Stream: Near-Realtime External Export

**Metric Stream**, GA'd in 2021, streams metric changes near-realtime (< 2min) to Kinesis Firehose. Common operator pattern:

```
[CloudWatch Metric Stream]
    │ (OpenTelemetry 0.7 or JSON)
    ▼
[Kinesis Data Firehose]
    │
    ├─→ S3 (long-term retention / Athena analysis)
    ├─→ Datadog (external monitoring integration)
    ├─→ New Relic / Splunk
    └─→ Lambda (custom processing)
```

Benefits:
- More cost-effective than polling GetMetricData every minute
- Near-realtime delivery (push-based)
- OpenTelemetry standard format support

> 🔍 **Deeper context**: Polling all metrics via GetMetricData every minute multiplies API call costs and latency. Metric Stream pushes raw metric events inside CloudWatch directly to Firehose, eliminating polling. Standard method for operators moving metrics to external tools like Datadog/New Relic. Cost: $0.003 per 1,000 metric updates + standard Firehose charges.

## Summary

CloudWatch Metrics operator checklist:

1. **Manage dimension cardinality**: Never put high-cardinality fields like user_id or request_id in dimensions (use EMF metadata instead)
2. **High-Resolution only when truly needed**: Limit to 30s-1min spike workloads
3. **EC2 memory/disk requires CloudWatch Agent**: Deploy bulk with SSM Run Command
4. **Custom metrics prefer EMF over PutMetricData**: Zero API cost
5. **Alarms track p95/p99, not average**: Long tail protection
6. **High-variance metrics use Anomaly Detection**: After data accumulates
7. **Long-term retention via Metric Stream → Firehose → S3**: Bypass 15-month auto-delete

Tomorrow: **CloudWatch Logs**, paired with metrics. We explore log groups, streams, retention policy, Subscription Filters, VPC Flow Logs cost pitfalls.

---

## 📝 연습 문제

**문제 1.** How do you collect EC2 memory usage alarm?

A) Enable EC2 Detailed Monitoring; automatic publish
B) Install CloudWatch Agent on EC2, publish mem_used_percent. Bulk deploy via SSM Run Command + Parameter Store pattern
C) Lambda SSH into every instance, run free -m every minute
D) CloudWatch auto-collects at hypervisor level

**정답: B**
해설: EC2 standard metrics measure at Nitro hypervisor level, so guest OS memory/disk usage is invisible. CloudWatch Agent measures inside guest OS and pushes to CloudWatch. Operator standard is bulk SSM Run Command installation + apply config from Parameter Store. Detailed Monitoring only shortens 5-min → 1-min collection; memory/disk still absent.

---

**문제 2.** For fast traffic spike detection, you want ASG to respond in 10-second units instead of per-minute. Which option is required?

A) Set ASG cooldown to 10 seconds
B) Publish High-Resolution metric (1-second resolution) via PutMetricData + 10-second alarm evaluation + Step Scaling
C) Enable Detailed Monitoring
D) CloudWatch Logs Subscription for immediate processing

**정답: B**
해설: High-Resolution metric (StorageResolution=1) accumulates 1-second data points; alarms can evaluate at 10-second intervals. Step Scaling adds multiple instances based on threshold overage magnitude. Detailed Monitoring maxes at 1-minute resolution; cooldown is inter-scaling delay, unrelated to detection speed.

---

**문제 3.** Lambda average response is 200ms but some users report slowness. What metric and statistic should the operator watch?

A) Average Duration
B) Sum Duration
C) p95, p99 Duration (Extended Statistic)
D) SampleCount

**정답: C**
해설: Average hides long tail. Even if 1% takes 5 seconds but 99% are fast, average stays ~200ms. p95 (top 5%), p99 (top 1%) percentiles expose long tails showing bad user experience. SLO standard defines latency via percentiles, not average.

---

**문제 4.** Operator wants to monitor ALB 5xx error rate (errors / total requests). How to build it?

A) Simple threshold on `HTTPCode_Target_5XX_Count`
B) Math Expression `(m1/m2)*100` combining `HTTPCode_Target_5XX_Count` and `RequestCount`, then alarm on result
C) CloudWatch Logs Insights ratio calculation
D) ALB's built-in `5XXErrorRate` standard metric

**정답: B**
해설: Ratios with different numerator/denominator metrics require Math Expression `(5xxCount / RequestCount) * 100`. Set alarm on result expression. ALB doesn't provide ratio metrics directly; fixed absolute thresholds cause false positives with traffic variance.

---

**문제 5.** API bills soared calling `PutMetricData` for every HTTP request. Most efficient alternative?

A) Batch API calls together
B) Embed metrics in logs using Embedded Metric Format (EMF) → CloudWatch auto-extracts (zero API calls)
C) Reduce metric publication frequency
D) Store metrics directly to S3

**정답: B**
해설: EMF embeds JSON metrics inside log messages; CloudWatch auto-extracts to metrics. Zero API cost. Standard pattern for Lambda/ECS/Fargate. AWS Lambda Powertools library auto-generates.

---

**문제 6.** After how many hours does 1-second CloudWatch metric resolution aggregate to 60-second?

A) 1 hour
B) 3 hours
C) 15 days
D) 63 days

**정답: B**
해설: 1s → 3hr to 60s aggregation, 15d to 5min, 63d to 1hr, 15mo permanent delete. To retain 1-second data long-term, export via GetMetricData or Metric Stream to S3.

---

**문제 7.** Workload has daily lunch/dinner traffic peaks with different weekend patterns. Build false-positive-free alarms?

A) Set fixed threshold above average
B) Anomaly Detection alarm (apply after 2-week data accumulation)
C) Composite Alarm combining multiple alarms
D) Math Expression for trend calculation

**정답: B**
해설: Anomaly Detection ML-learns hourly/daily patterns, generates dynamic baseline. Normal pattern variance doesn't trigger; only genuine anomalies (true outliers) alarm. Requires 2-week minimum; immediate application on new metrics causes over-alarming.

---

**문제 8.** Company added `UserId` Dimension for 1M users' latency tracking. Bill exploded. Root cause and fix?

A) Detailed Monitoring disabled / enable it
B) Dimension cardinality explosion created 1M metrics / move to EMF metadata fields, analyze per-user via Logs Insights
C) 1-second resolution was set / change to 60-second
D) Wrong region / unify to same region

**정답: B**
해설: `(Namespace, MetricName, Dimensions)` tuple = separate metric; $0.30/metric/month. 1M users = 1M metrics = $300k/month. Per-user/per-request analysis belongs in logs (EMF metadata + Logs Insights), not metric dimensions.

