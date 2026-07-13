# Day 4 - Metric Filter, EMF Deep-Dive, Anomaly Detection: Three Bridges Between Metrics and Logs

One daily operator decision: "publish this as metric or keep as log?" Both sides of same coin. Metrics enable fast alarms and auto-scaling via time-series + statistics; logs enable debugging via raw detail. Metrics expensive per-minute and per-dollar; logs cardinality-free but slow search. Three bridges connect both worlds — **Metric Filter, EMF, Anomaly Detection**. Today we deep-dive into their internals.

Applied correctly, these enable: convert existing logs to metrics without code (Metric Filter), unify metrics+logs+trace with one line (EMF), learn hourly normal patterns then alert on anomalies only, no manual work (Anomaly Detection). Exams frequently confuse scenarios mixing these three.

## Metric Filter: Transform Logs to Metrics

Metric Filter matches log patterns in Log Groups and transforms to CloudWatch metrics. Example: count 5xx responses in ALB access logs as metric, count OOM events in syslog.

```
[Log Group: /aws/elb/access]
   "GET /api 500 ..."
   "POST /order 201 ..."
   "GET /user 503 ..."
        │
        │ Metric Filter Pattern: [request, status=5*, ...]
        ▼
[CloudWatch Metric: MyApp/5xxCount = 2]
   (2 matches in this 1-minute window)
```

### Filter Pattern Syntax

```
# 1) Simple word
"ERROR"               ← Match contains "ERROR"

# 2) Multiple words (AND)
"ERROR" "Database"    ← Contains both

# 3) OR pattern (?)
?ERROR ?CRITICAL ?Exception   ← One of three

# 4) Term exclusion
"ERROR" -"timeout"    ← ERROR but not timeout

# 5) Field-based (space-delimited text logs)
[ip, user, ..., status=5*, size, ...]    ← 5xx only

# 6) JSON-based
{ $.level = "ERROR" && $.statusCode >= 500 }

# 7) Numeric comparison
{ $.duration > 1000 }
{ $.errorRate >= 0.05 }
```

### Metric Filter Usage Pattern (CloudFormation)

```yaml
MyErrorFilter:
  Type: AWS::Logs::MetricFilter
  Properties:
    LogGroupName: /aws/lambda/myfn
    FilterPattern: "?ERROR ?CRITICAL ?Exception ?FATAL"
    MetricTransformations:
      - MetricName: ErrorCount
        MetricNamespace: MyApp/Lambda
        MetricValue: "1"
        DefaultValue: 0         # ★ Also publish 0 when no match
        Dimensions:
          - Key: FunctionName
            Value: $.functionName
          - Key: Env
            Value: $.env
        Unit: Count
```

`DefaultValue: 0` matters. Without it, "no data" and "0 occurrences" become indistinguishable, causing false negatives in alarm `TreatMissingData` handling.

> ⚠️ **Pitfall**: Skip `DefaultValue`, no metric published on no-match. If alarm `TreatMissingData=notBreaching` (default), no data = normal = false negative. Setting `DefaultValue: 0` ensures "0 occurrences" state is explicit. Exam scenario "Metric Filter alarm won't trigger" or "TreatMissingData effect" almost always this pitfall.

> 🔍 **Deeper context**: Metric Filter evaluated **at log ingestion time** (when log arrives in stream). Only new logs trigger metric publishing. **Does not retroactively re-evaluate past logs** — new Filter counts only from creation onward. Operators unfamiliar with this often assume "I'll create Filter for yesterday's ERROR logs" and see empty graph. Historical analysis requires separate Insights query.

> 💡 **Related theory**: Metric Filter is **stateless transformation** in stream processing. Kafka Streams, Flink, AWS Kinesis Data Analytics all same paradigm. Applies only to "in-flight" data; historical batch separate.

### Metric Filter Limitations and Alternatives

| Limitation | Alternative |
|------------|-------------|
| Can't retroactively process past logs | Logs Insights separate aggregation |
| Max 100 metric filters per Log Group | Publish EMF directly |
| Cardinality explosion risk (user_id in Dimension) | EMF metadata fields instead |
| Evaluation latency minute-level | Subscription Filter + Lambda → PutMetricData |

## EMF Deep-Dive: Facts Operators Must Know

Yesterday's EMF is the standard for metrics+logs integration. Today we go deeper.

### EMF JSON Spec Detail

```json
{
  "_aws": {
    "Timestamp": 1716700000000,
    "CloudWatchMetrics": [
      {
        "Namespace": "MyApp",
        "Dimensions": [
          ["Service"],
          ["Service", "Operation"],
          ["Service", "Operation", "Env"]
        ],
        "Metrics": [
          {"Name": "Latency", "Unit": "Milliseconds", "StorageResolution": 60},
          {"Name": "ErrorCount", "Unit": "Count"},
          {"Name": "OrderValue", "Unit": "None"}
        ]
      }
    ]
  },
  "Service": "checkout",
  "Operation": "PlaceOrder",
  "Env": "prod",
  "Latency": 234,
  "ErrorCount": 0,
  "OrderValue": 49.99,
  "RequestId": "abc-123",
  "UserId": "u-999",
  "TraceId": "1-5759e988-bd862e3fe1be46a994272793"
}
```

4 key facts:

1. **Each element in `Dimensions` array is separate dimension combination**. Above publishes `(Service)` / `(Service, Operation)` / `(Service, Operation, Env)` — three separate metrics. Single EMF JSON can create multiple dimension sets, controlling cardinality trade-off.
2. **All EMF JSON fields stored as log**, but only ones declared in `CloudWatchMetrics` become metrics. Rest used for log search only.
3. **High-cardinality fields (RequestId, UserId, TraceId) are log fields only, not dimensions**. Prevents metric cardinality explosion.
4. **Per-metric `StorageResolution=1` enables 1-second resolution**.

### EMF PowerTools Library

```python
# AWS Lambda Powertools (Python)
from aws_lambda_powertools import Metrics, Logger, Tracer
from aws_lambda_powertools.metrics import MetricUnit

metrics = Metrics(namespace="MyApp", service="checkout")
logger = Logger(service="checkout")
tracer = Tracer(service="checkout")

@logger.inject_lambda_context
@tracer.capture_lambda_handler
@metrics.log_metrics  # Auto-outputs EMF JSON at function end
def lambda_handler(event, context):
    metrics.add_metric(name="ItemsProcessed",
                       unit=MetricUnit.Count, value=10)
    metrics.add_metric(name="Latency",
                       unit=MetricUnit.Milliseconds, value=234)
    metrics.add_dimension(name="Operation", value="PlaceOrder")
    metrics.add_dimension(name="Env", value="prod")
    # Add log field (not metric, avoid cardinality)
    metrics.add_metadata(key="user_id", value="u-999")
    metrics.add_metadata(key="order_id", value="o-456")
    logger.info("Order processed", extra={"order_id": "o-456"})
```

This single call outputs EMF JSON to stdout, Lambda delivers to CloudWatch Logs, metrics auto-extract. Simultaneously X-Ray trace written.

```javascript
// AWS Lambda Powertools (TypeScript)
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';

const metrics = new Metrics({ namespace: 'MyApp', service: 'checkout' });

export const handler = async (event) => {
  metrics.addMetric('ItemsProcessed', MetricUnits.Count, 10);
  metrics.addMetric('Latency', MetricUnits.Milliseconds, 234);
  metrics.addDimension('Operation', 'PlaceOrder');
  metrics.addMetadata('user_id', 'u-999');
  metrics.publishStoredMetrics();
};
```

> 📚 **Case study**: Financial company published 5 metrics (latency, amount, error_count, retry_count, db_calls) per transaction via PutMetricData. 10 billion API calls/month → $100,000 API cost. After EMF: zero API cost, log cost rose slightly (20%), 90% total savings. Why EMF is "operator cost-saving #1."

> 💡 **Related theory**: EMF follows OpenTelemetry (OTel) philosophy of metrics+logs+traces integration. Single telemetry event extracts all three. CNCF OpenTelemetry started 2019 (OpenTracing + OpenCensus merge), GA 2021, de facto standard 2024. AWS supports OTel via EMF and ADOT (AWS Distro for OpenTelemetry).

### EMF Limitations

| Limitation | Meaning |
|------------|---------|
| Metric extraction latency minute-level | Immediate alarm needs better with PutMetricData |
| Log ingestion cost incurred | Metric cost saved but log cost increases |
| Requires Log Group | Can't use in log-disabled environments |
| Metric accuracy depends on log accuracy | Missing logs means missing metrics |

## Anomaly Detection: ML-Based Dynamic Baseline

Fixed-threshold alarms (CPU > 80%) fail on workloads with time-varying normal patterns; false positives explode. **Anomaly Detection** learns 2-week patterns via ML to generate dynamic baselines.

### How It Works

```
[CPU metric, last 14 days]
    │
    │ STL/ARIMA regression learning
    ▼
[Model: per-weekday + per-hour average + stddev]
    │
    │ Hourly retraining
    ▼
[Anomaly Band: mean ± n × stddev]
    │
    │ Metric outside band → alarm
    ▼
[Alarm Trigger]
```

Alarm config specifies only std-dev multiplier (n). Usually 2 (95% confidence) ~ 3 (99.7%). Choose by metric noise level and acceptable false positive rate.

> 💡 **Related theory**: STL (Seasonal-Trend Decomposition using LOESS) decomposes time-series into trend (long-term) + seasonal (periodic) + residual. Cleveland et al. (1990, *Journal of Official Statistics*). ARIMA (AutoRegressive Integrated Moving Average) more general model, Box-Jenkins method (1970, *Time Series Analysis*). Facebook Prophet (Taylor & Letham, 2017), Twitter AnomalyDetection (2015 GitHub), AWS Forecast all same family. ML replaces manual per-time-of-day threshold tuning.

### Operator Application Scenarios

| Scenario | Anomaly Detection effect | Fit |
|----------|------------------------|-----|
| Daily traffic peaks at same time | Peak hours don't alarm; only abnormal times | ★★★★★ |
| Weekend traffic different than weekday | Per-day-of-week learning → accurate baseline | ★★★★★ |
| Gradual growth trend (traffic increase) | Trend learning replaces fixed absolute threshold | ★★★★ |
| Frequent sudden traffic changes | False positive possible; increase std-dev multiplier | ★★ |
| Immediately post-launch (insufficient data) | Not suitable (need min 2d-2w data) | ★ |
| 24/7 uniform workload | Fixed threshold sufficient | ★ |

> 📚 **Case study**: E-commerce company had daily lunch 12pm and evening 7pm peaks plus different weekend patterns. Fixed thresholds generated 30 false positives daily → overnight page-outs. After Anomaly Detection, false positives dropped 90%. Overnight pages cut dramatically.

### Math Expression and Anomaly Detection Combination

```
m1 = ErrorCount (sum, 1min)
m2 = RequestCount (sum, 1min)
e1 = m1 / m2 * 100              # Error rate (%)
e2 = ANOMALY_DETECTION_BAND(e1, 2)  # ML baseline, ±2 std-dev
```

Alarm setting: `e1` exceeds `e2` upper band → alarm. Can combine with fixed threshold:

```
e1 > 5%  AND  e1 > e2.upper   # 5% threshold AND still abnormal vs normal
```

Combining "absolute + relative" prevents false positives during low-traffic hours (usually 0%).

> ⚠️ **Pitfall**: Anomaly Detection requires **min 2 weeks data to learn**. Immediate new-metric application fails due to learning shortage; nearly all points become anomalies. Exam scenario "new service anomaly detection immediately applied → wrong alarms" → answer "enable after 2d-2w data accumulation." Alarm still evaluates during learning but accuracy low.

## Logs Anomaly Detection (Launched 2023)

Similar to Metrics Anomaly Detection, **detects log pattern anomalies themselves** via ML. Unseen patterns or sudden frequency changes auto-alert.

```
[Learned normal patterns]
"INFO Started processing order=*"
"INFO Order * completed in *ms"
"WARN Retry attempt * for order *"

[Anomaly detection]
"FATAL Database connection lost"             ← Unseen pattern, alarm
"INFO Started processing order=*" (10x normal frequency) ← Abnormal frequency, alarm
"java.lang.OutOfMemoryError: Java heap space"  ← New exception pattern, alarm
```

ML auto-handles without manual Metric Filter creation. Like Metrics Anomaly, learning takes days~weeks; immediate new-workload application not recommended. False positives possible until stable baseline established.

> 🔍 **Deeper context**: Logs Anomaly Detection internally **clusters log patterns** (Drain algorithm family presumed), grouping similar logs as one pattern, then detects anomalies in frequency/timing via STL/ARIMA (2-step ML pipeline). Operators need not hand-code regex; ML auto-determines "these logs same type."

## Cross-Account Metric/Log View

To view metrics and logs from multiple accounts in one console, use **CloudWatch Observability Access Manager** (launched 2022).

```
[Monitoring Account] ← Operations team viewing account
   │ Enable Sink
   │
   ├── Source Account A metrics, logs, X-Ray auto-sync
   ├── Source Account B metrics, logs, X-Ray auto-sync
   └── Source Account C metrics, logs, X-Ray auto-sync
```

Operator pattern: Create separate monitoring account, connect sinks from all workload accounts. View all-account metrics/logs/X-Ray traces unified in one console. Organization-wide auto-enrollment option enables new accounts auto-connect.

## Three Tools Comparison: When to Use What

| Tool | When to use | Cost | Learning needed |
|------|-------------|------|-----------------|
| **Metric Filter** | No code change; extract metrics from existing logs | $0.30/metric | - |
| **EMF** | New code; integrate metrics+logs+trace | Zero API cost | - |
| **PutMetricData** | Immediate metric response needed | $0.01 per 1,000 calls | - |
| **Anomaly Detection (metric)** | Hourly pattern metrics | $0.30/metric extra | 2d-2w |
| **Anomaly Detection (logs)** | Log pattern anomalies | Analysis cost | Days-weeks |

Operator decision tree:

```
"How do I publish this information?"
   ├─ New code possible? ──── YES ──→ EMF (metrics+logs+trace unified)
   │                       
   ├─ Info exists in logs? ──── YES ──→ Metric Filter
   │
   ├─ Immediate alarm? ────── YES ──→ PutMetricData
   │
   └─ Otherwise ───────────────────→ EMF (default)

"What alarm for this metric?"
   ├─ Hourly pattern? ──── YES ──→ Anomaly Detection (after 2w data)
   ├─ Clear absolute threshold? ── YES ──→ Static threshold
   ├─ Ratio of two metrics? ──── YES ──→ Math Expression + threshold
   └─ Multiple AND/OR conditions? ─ YES ──→ Composite Alarm
```

## Summary

Today's flow:

- **Metric Filter**: Logs → Metrics (count existing logs as metric, no code change)
- **EMF**: Embed metrics in single log (zero API cost, metrics+logs+trace unified, most cost-efficient)
- **Anomaly Detection**: ML-based dynamic threshold (reduce false positives, requires accumulated data)

Operators structure observability for new workloads in order:

1. EMF for app metrics/logs unified publishing (use PowerTools)
2. AWS standard metrics as-is (EC2/RDS/Lambda etc)
3. Critical metrics (latency p99, error rate) with Anomaly Detection alarms (enable after 2 weeks)
4. Fixed-threshold alarms for clear-threshold metrics
5. Ratio alarms via Math Expression
6. Retention policy on all Log Groups
7. Cross-Account unified via Observability Access Manager

Tomorrow: Week 2 review + 10 scenario problems.

---

## 📝 연습 문제

**문제 1.** Created Metric Filter but no metric when no match, so alarm won't trigger. Root cause and fix?

A) Filter pattern incorrect
B) Set `DefaultValue: 0` to publish 0 on no-match. Properly configure alarm `TreatMissingData`
C) Log Group retention insufficient
D) Alarm Evaluation Period insufficient

**정답: B**
해설: Metric Filter publishes on match only. No match = no metric data → alarm `TreatMissingData` applies (default notBreaching = normal). Setting `DefaultValue: 0` ensures "0 occurrences" state explicit. Then alarm `>= 1` works correctly.

---

**문제 2.** Applied Anomaly Detection to new metric immediately; all data marked anomaly. Root cause?

A) Anomaly Detection needs min 2d-2w learning data. Insufficient data → wrong baseline
B) Metric dimensions incorrect
C) Alarm Evaluation Period insufficient
D) Not High-Resolution

**정답: A**
해설: Anomaly Detection learns from recent 2 weeks → new metrics lack data/insufficient data → wrong baseline → nearly all values anomalies. Operators enable after 2d-2w accumulation. Alarm still evaluates during learning but accuracy low.

---

**문제 3.** Workload has daily same-time traffic peaks plus different weekend pattern; reduce false positives?

A) Set fixed threshold to average + standard deviation
B) Anomaly Detection alarm (learns hourly/daily patterns)
C) Composite Alarm combining multiple alarms
D) Math Expression

**정답: B**
해설: Anomaly Detection learns per-hour per-day patterns via ML. Normal peaks treated as normal; only true anomalies trigger. Daily same-time peaks exactly the scenario Anomaly Detection excels.

---

**문제 4.** Operators published 5 metrics per transaction, API cost exploded. Most suitable alternative?

A) Batch PutMetricData calls
B) EMF single log line embeds 5 metrics (zero API calls)
C) Custom Logs Insights query per minute
D) Metric Filter

**정답: B**
해설: EMF single console.log auto-extracts metrics. Zero API cost. PowerTools library (Python/Java/TS) auto-generates. A limited effect, C increases latency, D processes existing logs.

---

**문제 5.** View metrics and logs from multiple accounts in one console?

A) Log into each account console separately
B) CloudWatch Cross-Account Observability + Monitoring Account Sink, Source from workload accounts
C) Export all logs to S3, query Athena
D) Consolidate all account IAM Roles

**정답: B**
해설: CloudWatch Observability Access Manager (2022): sink in monitoring account, source connection from workload accounts. Unified all-account metrics/logs/X-Ray in one console. Organization-wide auto-enrollment available.

---

**문제 6.** Operators want to count all Lambda ERROR / CRITICAL / Exception logs as single metric. Metric Filter pattern?

A) `"ERROR"` only
B) `?ERROR ?CRITICAL ?Exception` (OR pattern)
C) `"ERROR" "CRITICAL" "Exception"` (AND pattern, all three)
D) Logs Insights only

**정답: B**
해설: Metric Filter OR pattern uses `?` prefix. `?ERROR ?CRITICAL ?Exception` matches any one. AND (`"ERROR" "CRITICAL"`) requires both, wrong intent.

---

**문제 7.** Created Metric Filter but past 1 week ERROR logs don't appear in metrics. Root cause and fix?

A) Filter pattern wrong / fix regex
B) Metric Filter forward-only — new logs only. Past logs separate Logs Insights aggregation
C) Log Group retention insufficient / increase
D) IAM permission insufficient

**정답: B**
해설: Metric Filter evaluated at ingestion time; past logs not processed. New Filter counts only from creation forward. Historical analysis requires separate Insights query like `stats count(*) by bin(5m)`.

---

**문제 8.** EMF JSON: handle user_id (high-cardinality) and service (low-cardinality) correctly?

A) Both as metric dimensions
B) Service as dimension, user_id as regular field (metadata) — avoid metric cardinality explosion
C) Both as metric values
D) Not possible with EMF

**정답: B**
해설: `_aws.CloudWatchMetrics.Dimensions` contains low-cardinality fields (service, env, operation) only. High-cardinality fields (user_id, request_id, trace_id) as regular JSON fields — searchable in logs, no metric cardinality explosion. EMF core design intent.

