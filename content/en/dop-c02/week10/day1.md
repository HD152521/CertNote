# Day 1 - CloudWatch Metrics: Time Series, Dimensions, and Alarm Evaluation Model Deep Dive

Monitoring a single server is easy. Run `top` and see CPU, `free` and see memory. But when that one server becomes hundreds, Lambda functions run thousands of times per second, and ECS tasks scale up and down, the act of "monitoring" itself becomes a different problem. Who collects these numbers? How do we order them by time? What granularity do we aggregate to? How do we decide what "abnormal" means? CloudWatch Metrics is the foundation that collects numeric time series from almost everything running on AWS, and on top of it sit alarms, autoscaling, dashboards, and anomaly detection.

Today we dig deep into this foundation. Not just "send metrics with PutMetricData," but how metrics are stored internally as data structures (why namespace·name·dimensions combine as a single identifier), why EMF is structurally superior to PutMetricData on both cost and architecture, what reliability engineering principles the three dials of `evaluation-periods`/`datapoints-to-alarm`/`treat-missing-data` encode, and what statistical model Anomaly Detection uses. In DOP-C02 exams, CloudWatch is a foundational service threading through nearly every domain (monitoring, incident response, deployment validation), so scenarios like "why didn't the alarm fire," "how do we cut costs," and "how do we handle metrics where we can't set thresholds manually" appear every exam.

## Metric Identity — What Defines "One Metric"

The most misunderstood concept in CloudWatch is "metric identity." Many people think the metric name (`CPUUtilization`) is the metric itself, but CloudWatch actually identifies a time series with the **full combination of namespace + metric name + dimensions**. If any of these three differs, it's a completely separate time series.

```bash
aws cloudwatch put-metric-data \
  --namespace MyApp/Orders \
  --metric-name OrderCount \
  --value 5 \
  --dimensions Service=checkout,Environment=prod \
  --unit Count
```

This line adds one data point to the time series with key `MyApp/Orders | OrderCount | {Service=checkout, Environment=prod}`. If you change `Environment=staging`, that's a different time series. This design matters because **dimension cardinality (the number of unique combinations) directly equals the metric count, and metric count directly equals cost**. With `Service`(10 types) × `Environment`(3 types), you have 30 time series, but add `UserId`(1 million people) as a dimension and time series explode to millions. This is the root of the high-cardinality trap we'll see later.

> 💡 **Related Theory**: CloudWatch's model is exactly the standard time series database (TSDB) structure. Prometheus expresses the same concept as `metric_name{label1="v1", label2="v2"}` and calls each unique label combination a "series." InfluxDB uses measurement + tag set, OpenTSDB uses metric + tags. The core principle is **dimension (label/tag) is both the unit of indexing and the source of cardinality explosion**. Half of TSDB operations is cardinality management—deciding which dimensions to index and which to skip. CloudWatch charging per dimension comes from the same constraint.

> 🔍 **Deeper**: CloudWatch metrics have **a constraint that once you fix dimensions at publish time, you can't arbitrarily add aggregation dimensions later**. If you publish data with `{Service, Environment}`, then later want to "ignore Service and look at Environment only," you should have published that aggregation combination (`{Environment}` alone) at publish time too. That's why EMF's pattern `Dimensions: [["Service","Environment"], ["Environment"], []]` publishes multiple dimension combinations as arrays in one log output. With PutMetricData you can only send one dimension combination per call, so to see the same data across multiple aggregation views you need multiple calls — this is one place where EMF is structurally superior.

## Custom Metrics — Three Publishing Paths and Their Cost Models

AWS services automatically emit metrics to namespaces like `AWS/EC2`, `AWS/Lambda`. But business metrics like "order count" or "payment failure rate" you must publish yourself. There are three publishing paths, and their difference isn't just API choice but **cost model and data binding strategy**.

**First, PutMetricData API.** Most intuitive. Every time you publish a batch of metrics, one API call. The problem is cost. PutMetricData charges both on call count and custom metric count, and for Lambda called thousands of times per second, calling this on every invocation adds API cost and latency (if synchronous, you wait for response).

**Second, Embedded Metric Format (EMF).** Here the paradigm shifts. Instead of sending metrics via a separate API, **embed them in special JSON structure inside the logs you're already outputting**. When Lambda or ECS prints JSON to stdout, that goes to CloudWatch Logs, and if CloudWatch sees an `_aws` key, it **automatically extracts metrics while ingesting the log**.

```json
{
  "_aws": {
    "Timestamp": 1716368400000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp/Orders",
      "Dimensions": [["Service"]],
      "Metrics": [{"Name": "OrderCount", "Unit": "Count"}]
    }]
  },
  "Service": "checkout",
  "OrderCount": 5,
  "OrderId": "ord-abc-123"
}
```

Zero additional metric API calls. Your code just logs, metrics come along as a side effect. Plus, high-cardinality identifiers like `OrderId` stay as **log fields** and can be searched in Logs Insights, not metrics. You cleanly separate metrics (low-cardinality aggregation) from logs (high-cardinality detail) in one output — that's the essence of EMF.

**Third, CloudWatch Agent.** Collects system metrics (memory, disk — these are outside the hypervisor so absent from EC2 base metrics) and logs on EC2 and on-premises. Compatible with StatsD/collectd protocols to accept existing instrumentation as-is.

> 💡 **Related Theory**: EMF's "embed metrics in logs" idea is the convergence of structured logging and metrics. Traditionally logs (text, high-cardinality, post-search) and metrics (numeric, low-cardinality, real-time aggregation) were separate pipelines. EMF integrates them into one event. This is the same philosophy as observability's "wide events" or "canonical log lines" (popularized by Stripe) — log one wide event per request with all context, then derive metrics, logs, and traces from it. Honeycomb's high-cardinality event model and OpenTelemetry's unified signals follow the same direction.

> 📚 **Case Study**: A fintech startup was handling thousands of payment transactions per second in a Lambda and calling PutMetricData synchronously with 5 dimensions per transaction. It hit CloudWatch API throttling (account/region TPS limit), some calls failed, and worse, the synchronous call latency added to Lambda execution time, slowing payment responses. Switching to EMF eliminated metric API calls to zero, throttling disappeared, and Lambda just logs (no latency overhead). "Never call PutMetricData synchronously in the hot path" is the anti-pattern EMF solves.

## High-Resolution Metrics — One-Second Resolution: Problem Solved and Price Paid

Standard metrics are 60-second resolution. One data point per minute. Fine for most operations, but for workloads with second-scale traffic spikes, 60-second averages hide the truth. Traffic doubles for 30 seconds then drops; it shows as barely a bump in the 60-second average. High-Resolution Metrics provide **1-second resolution** to catch these fine spikes.

```bash
aws cloudwatch put-metric-data \
  --namespace MyApp/Traffic --metric-name RequestRate \
  --value 4500 --storage-resolution 1
```

`--storage-resolution 1` enables 1-second resolution (default is 60). The cost: 60x more data points means 60x more storage cost, and 1-second data retains for only 3 hours (then automatically rolls up to coarser resolution). Alarms also: standard minimum is 60-second evaluation, but high-resolution metrics allow 10-second or 30-second evaluation for faster response.

> 🔍 **Deeper**: CloudWatch **gradually rolls up metrics to coarser resolution over time**. 1-second data retains 3 hours, 60-second data 15 days, 5-minute data 63 days, 1-hour data 15 months. So yesterday's 1-second spike, viewed today, is just a 1-minute average. This is the standard time series storage technique of **downsampling/rollup** (RRDtool's RRA, Prometheus recording rules + long-term storage, Graphite retention schema). The implication: high-resolution precision analysis must happen within 3 hours of the event. For post-incident forensics needing high-resolution originals, you must preserve separately via Metric Streams.

## Alarm Evaluation Model — Three Dials Encoding Reliability Engineering

Alarms are the most often misconfigured part of CloudWatch. Not the simple model "fire if threshold exceeded," but **how often you report (period), how many reports (evaluation-periods), how many breaches trigger fire (datapoints-to-alarm), and how you treat missing data (treat-missing-data)** — four dials controlling behavior.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name High5xxRate \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --dimensions Name=LoadBalancer,Value=app/MyApp/abc \
  --statistic Sum --period 60 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:...:AlertTopic
```

The evaluation rule is **"M out of N"**. This config says "if 2 out of the last 3 evaluation periods (`evaluation-periods 3`) exceed threshold 10, ALARM." Why so complex? **To filter out single-spike noise**. Set `datapoints-to-alarm` to 1 and every bounce fires it—alarm fatigue. Set to 3 of 3 and "sustained abnormal" is all you catch. For metrics needing fast response, keep N small; for metrics needing noise reduction, increase M/N ratio. This is **sensitivity vs. specificity trade-off dialed in**.

`treat-missing-data` is more subtle. How do you interpret periods with zero data points?

| Value | Meaning | Use Case |
|-------|---------|----------|
| `notBreaching` (default) | No data = normal | Sparse metrics (rare events) |
| `breaching` | No data = breach | "Heartbeat gone = disaster" |
| `missing` | Excluded from evaluation | Withhold judgment |
| `ignore` | Keep current state | Prevent state flapping |

> 💡 **Related Theory**: Alarm "M out of N" + missing data handling is like signal processing's **debouncing/hysteresis**. An electric switch, if it receives noisy bounce signals from contact chatter, will toggle on/off dozens of times, so we apply debounce to accept only states stable for a time. Alarm's `datapoints-to-alarm` is temporal debounce; comparison operator + separate OK threshold is hysteresis. Statistically: balancing false positives (Type I error) and false negatives (Type II error). Too sensitive = noise, too dull = missed anomalies. Good alarm design picks the right point on that spectrum for your SLO.

> ⚠️ **Trap**: For sparse metrics (like payment failures — normally 0 so no data points), set `treat-missing-data: breaching` and the alarm gets stuck in perpetual ALARM. No failures = no data, but missing data = breach in that setting. Conversely, for heartbeat metrics (reports 1 per minute when alive), use `notBreaching` and a dead instance stops heartbeat, but you interpret missing data as normal—missing the outage. **Your metric semantics (is missing data good or bad?) must drive opposite choices.** Getting these two backward is the most common cause of alarm misconfiguration.

## Composite Alarm — Boolean Algebra of Alarms

When alarms multiply, a new problem emerges. One incident ("checkout service down") fires multiple alarms (5xx surge, latency spike, throughput drop) so on-call gets three pages. Composite Alarm **combines child alarms with Boolean logic (AND/OR/NOT)** into one higher alarm.

```bash
aws cloudwatch put-composite-alarm \
  --alarm-name AppDegraded \
  --alarm-rule "ALARM('High5xx') AND (ALARM('HighLatency') OR ALARM('LowThroughput'))" \
  --alarm-actions arn:aws:sns:...:AppOncall
```

Now you only wake someone when "5xx is high AND (latency OR throughput is bad)." Individual alarms stay as signals with no notification; only Composite pages. Alarm noise drops dramatically, and you can define "what is a real incident" as a formula.

> 🔍 **Deeper**: Composite Alarm provides **Boolean algebra over alarm states** to express "symptom correlation." A single metric is just one symptom; real incidents are specific patterns of multiple symptoms. This is part of the path to **symptom-based alerting** maturity — what Google SRE emphasizes: "alert on user-facing symptoms, not root causes." By defining "5xx AND elevated latency = user actually impacted" with Composite, you cut the noise of cause-based alerting that wakes you for every internal component hiccup. AND reduces false positives; OR encompasses multiple failure paths as one incident.

## Anomaly Detection and Metric Math — Learn Thresholds and Derive Metrics

Some metrics can't have static thresholds. Order count is high on weekday afternoons, low at night, different pattern on weekends. Set "order count < 100 alarm" and you get false alarms every night. **Anomaly Detection uses machine learning to learn the time-of-day and day-of-week patterns**, dynamically drawing "normal range for this time/day."

```bash
aws cloudwatch put-anomaly-detector \
  --namespace AWS/ApplicationELB --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=app/MyApp/abc --stat p99
```

Set alarm to "fire if outside learned normal band" with `LessThanLowerOrGreaterThanUpperThreshold`. Humans don't pick thresholds; the model draws the band.

**Metric Math combines multiple metrics with formulas to create derived metrics.** The classic example is ratios.

```
e1: (errors / invocations) * 100   # error rate (%)
```

Raw `Errors` and `Invocations` are absolute counts varying with traffic, but error rate has consistent meaning regardless of traffic volume. You can't create an "error rate > 1%" alarm without Metric Math.

> 💡 **Related Theory**: CloudWatch Anomaly Detection uses **seasonal decomposition** models internally. It splits a time series into trend + seasonal (daily/weekly cycles) + residual, like classical STL decomposition or Holt-Winters exponential smoothing. The model learns "expected value and normal variance for this time/day," draws a band around it, and marks observations outside the band as anomalies. It's like statistical process control (SPC) control charts where ±3σ management limits mark anomalies, except σ isn't fixed—it's learned per time-of-day. Seasonality-bearing business metrics that you can't threshold manually are exactly where this tool applies.

## Exporting Metrics — Metric Streams and Cross-Account

Two paths export metrics out of CloudWatch. **Metric Streams** sends metrics nearly real-time via Kinesis Data Firehose to S3, Datadog, Splunk, New Relic, etc. Lower latency than the polling `GetMetricData` approach, no missed data points, and no API throttling at scale. It's the standard path for integrating AWS metrics into multi-cloud observability tools.

**Cross-Account Observability** (2023+) aggregates metrics, logs, and traces from multiple accounts into one monitoring account. When source accounts trust the sink ARN, the monitoring account sees that data one-way (source can't see monitoring account data). For multi-account organizations, central SRE teams see everything on one screen.

> 🎯 **Scenario**: "Our org standardizes on Datadog. We want to integrate AWS metrics into Datadog but our current polling approach (Datadog calls GetMetricData/ListMetrics periodically) hits CloudWatch API throttling on hundreds of thousands of metrics." The answer is Metric Streams. Existing integrations usually have Datadog polling GetMetricData/ListMetrics periodically, and at high metric counts API throttling and latency pile up. Metric Streams has CloudWatch push to Firehose, so polling vanishes, latency drops from minutes to seconds, and API limits are fundamentally gone. The shift from "polling → push streaming" is the key.

## Summary

Today we covered five points. First, **metric identity is the full namespace+name+dimensions combination**, and dimension cardinality equals metric count equals cost. Second, **among three publishing paths (PutMetricData·EMF·Agent), EMF is structurally superior for Lambda/ECS** — zero metric API calls, log/metric integration, simultaneous multi-dimension publication. Third, **alarms are not just thresholds but "M out of N" + missing data handling**, a debouncing model where you must choose opposite missing-data handling based on metric semantics. Fourth, **Composite Alarm is Boolean algebra of alarms**, expressing symptom correlation to reduce noise. Fifth, **Anomaly Detection learns thresholds via seasonal decomposition**, Metric Math creates derived metrics like ratios, and Metric Streams converts polling to push for external integration.

Next we deep-dive CloudWatch Logs: how logs organize into groups and streams, how Subscription Filters stream logs real-time elsewhere, what drives the Logs Insights query engine and why logs are so expensive, and how to control log costs — inside the log pipeline.

---

## 📝 Practice Questions

**Question 1.** A Lambda function publishes custom metrics on a hot path that is invoked thousands of times per second. Calling PutMetricData synchronously on every invocation causes API throttling and increased response latency. Which improvement is MOST appropriate?

A) Reduce the number of metric dimensions
B) Switch to EMF — embed metrics in logs so that there are zero metric API calls
C) Switch to a High-Resolution Metric
D) Move the PutMetricData calls to an asynchronous thread

**Answer: B**

Explanation: Calling PutMetricData synchronously on a hot path accumulates API throttling (account/Region TPS limits) and call latency. EMF does not send metrics through a separate API; it embeds them in the log JSON that is already being emitted, using the `_aws` structure, and CloudWatch extracts them automatically at ingestion. Metric API calls drop to zero, so both throttling and latency disappear. Reducing dimensions (A) is only a partial mitigation and not a root-cause fix, High-Resolution (C) actually increases cost, and an asynchronous thread (D) does not eliminate throttling itself.

---

**Question 2.** You want to view the same data by `{Service, Environment}`, by `{Environment}` alone, and as a total aggregate. Doing this with PutMetricData is cumbersome. What is the MOST efficient approach?

A) Call PutMetricData three times
B) Publish multiple dimension combinations at once with EMF `Dimensions: [["Service","Environment"], ["Environment"], []]`
C) Aggregate after the fact with Metric Math
D) Enable Anomaly Detection

**Answer: B**

Explanation: CloudWatch provides aggregation only for the dimension combinations specified at publish time, so if multiple aggregation views are needed, all of those combinations must be published. EMF accepts `Dimensions` as an array of arrays and publishes multiple dimension combinations (both / Environment only / total aggregate `[]`) simultaneously from a single log output. PutMetricData (A) requires a separate call per combination, which is inefficient, and Metric Math (C) only combines time series that have already been published; it cannot create aggregation dimensions after the fact that do not exist.

---

**Question 3.** An ALB 5xx alarm fires even on one-off spikes, causing severe on-call fatigue. How can you catch only sustained anomalies while ignoring transient blips?

A) Set `datapoints-to-alarm` to 1 and `evaluation-periods` to 1
B) Use `evaluation-periods 3` and `datapoints-to-alarm 2` for "2 out of 3" evaluation
C) Reduce the period to 1 second
D) Lower the threshold to 0

**Answer: B**

Explanation: "M out of N" (here, 2 out of 3) is debouncing along the time axis. The alarm enters ALARM only when 2 of the last 3 evaluation periods are in breach, so one-off spikes are filtered out and only sustained anomalies are caught. A fires on a single blip, maximizing noise; shortening the period (C) actually makes it more sensitive; and a threshold of 0 (D) produces a permanent ALARM.

---

**Question 4.** The payment-failure metric is normally 0, so there are no datapoints at all (sparse). To alarm only when failures exceed the threshold, which `treat-missing-data` setting should you use?

A) `breaching`
B) `notBreaching` — treat missing data as normal
C) `missing` alone is sufficient
D) Switch to high-resolution

**Answer: B**

Explanation: For a sparse metric, having no data is the normal state. Setting `notBreaching` treats missing data as normal, so the alarm goes to ALARM only when actual failures exceed the threshold. Setting `breaching` (A) traps the alarm in permanent ALARM even though there is no data simply because there are no failures. Conversely, for metrics like heartbeats where "no data = outage", `breaching` should be used, so the missing-data handling must be chosen in opposite ways depending on the meaning of the metric.

---

**Question 5.** A single incident ("checkout outage") triggers three alarms at once (5xx, latency, and throughput), so the on-call engineer receives three pages. How can you reduce noise while defining a "real incident"?

A) Delete all three alarms and keep only 5xx
B) Define a Composite Alarm with `ALARM('High5xx') AND (ALARM('HighLatency') OR ALARM('LowThroughput'))` and attach notifications only to the Composite
C) Raise the thresholds of all three alarms
D) Reduce SNS subscriptions

**Answer: B**

Explanation: A Composite Alarm combines child alarms with a Boolean expression to define "a specific combination of symptoms = an incident." If the individual alarms act as signals without notifications and only the Composite sends pages, the on-call engineer is woken once per incident, and the precise condition "5xx and (latency or throughput anomaly)" reduces false positives. Deleting alarms (A) loses visibility, raising thresholds (C) misses real anomalies, and reducing subscriptions (D) does not address the root problem.

---

**Question 6.** Order volume is high during weekday daytime, low at dawn, and follows a different pattern on weekends. A static threshold produces false alarms every dawn. What is the MOST appropriate tool?

A) High-Resolution Metric
B) Anomaly Detection — learns normal bands by time of day and day of week and detects only deviations
C) Composite Alarm
D) Metric Filter

**Answer: B**

Explanation: A metric with seasonality (daily/weekly cycles) cannot be handled with a single static threshold. Anomaly Detection decomposes the time series into trend, seasonality, and residual, dynamically learns "the normal range for this time and this day of the week," and alarms only when the observed value leaves that band. High-Resolution (A) is only a resolution matter and does not address seasonality, Composite (C) combines alarms, and Metric Filter (D) is a separate feature that extracts metrics from logs.

---

**Question 7.** You cannot create an "error rate exceeds 1%" alarm using the absolute values `Errors` and `Invocations`. How can you create a traffic-independent ratio alarm?

A) Set a threshold only on Errors
B) Compute `(errors / invocations) * 100` with Metric Math and set the alarm on the result
C) Anomaly Detection
D) Composite Alarm

**Answer: B**

Explanation: Metric Math combines multiple metrics with an expression to create derived metrics. The error rate = (errors / invocations) × 100 has a consistent meaning regardless of traffic volume, so an alarm on this expression keeps the ratio-based criterion even as traffic grows. A threshold on the absolute Errors value (A) grows with traffic and loses its meaning, and Anomaly Detection (C) and Composite (D) do not provide ratio calculation itself.

---

## 📌 Today's Summary

There are five key takeaways today. First, a metric's identity is the entire combination of namespace + name + dimensions, so dimension cardinality is the number of metrics and therefore the cost (the same concept as a series in Prometheus/InfluxDB). Second, among publishing paths, EMF is structurally superior in Lambda/ECS — zero metric API calls, unified logs and metrics, simultaneous publishing of multiple dimension combinations, and high-cardinality identifiers separated into log fields. Third, alarms are a debouncing model of "M out of N" + treat-missing-data; the missing-data handling must be chosen in opposite ways depending on the meaning of the metric — notBreaching for sparse metrics, breaching for heartbeats. Fourth, a Composite Alarm expresses symptom-based correlation through Boolean algebra over alarms to reduce noise. Fifth, Anomaly Detection learns thresholds through seasonal decomposition, Metric Math handles derived metrics such as ratios, and Metric Streams solves external integration by switching from polling to push.
