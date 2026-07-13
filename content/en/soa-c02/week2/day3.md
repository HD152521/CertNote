# Day 3 - Logs Insights Query Language: Operator's Debugging SQL

Logs Insights is a distributed query engine layered on top of CloudWatch Logs. If an operator doesn't master this tool that scans 1TB of logs in 30 seconds, troubleshooting drops from 1 hour to 5 minutes differently depending on mastery. When you get a PagerDuty alert at 3am, the difference between an operator who answers "which path, which user_id, which exception" in a five-line query and one spending 30 minutes on console text search ultimately comes down to Insights proficiency.

Today we build a **library of patterns operators use daily**: Insights query syntax, cost/performance optimization, Live Tail, Logs Anomaly Detection, EMF integration.

## Insights Query Basic Structure

```
fields    @timestamp, @message    ← Select output fields
| filter  status_code >= 500       ← Condition filter
| stats   count(*) by url          ← Aggregate
| sort    count desc               ← Sort
| limit   20                       ← Limit results
```

These 5 commands (`fields`, `filter`, `stats`, `sort`, `limit`) + `parse` (extract fields from message via regex/glob) + `display` + `dedup` comprise 95% of operator usage. Difference from SQL: **pipe style** makes step-by-step transformation clear, auto-discovered fields (e.g., `@duration`, `@type`, `@billedDuration`) and user fields handled simultaneously.

### Auto-Discovered Fields (`@`-prefixed)

| Field | Source | Meaning |
|-------|--------|---------|
| `@timestamp` | All logs | Event time |
| `@message` | All logs | Original log message |
| `@logStream` | All logs | Associated Log Stream name |
| `@log` | All logs | Log Group ARN |
| `@ingestionTime` | All logs | Ingestion time |
| `@duration` | Lambda REPORT | Function execution time (ms) |
| `@billedDuration` | Lambda REPORT | Billed time (ms, 1ms units) |
| `@maxMemoryUsed` | Lambda REPORT | Peak memory (MB) |
| `@memorySize` | Lambda REPORT | Allocated memory (MB) |
| `@initDuration` | Lambda REPORT (Cold Start) | Initialization time. Identifies cold start |
| `@type` | Lambda | START / END / REPORT |
| `@requestId` | Lambda | Request tracking |

Knowing these fields unlocks 90% of Lambda debugging queries.

## Operator Troubleshooting Pattern Library

### 1. ALB/NLB 5xx spike — which path is culprit?

```sql
fields @timestamp, @message
| parse @message /(?<method>\S+)\s+(?<url>\S+)\s+HTTP\/(?<httpVer>\S+)\"\s+(?<status>\d{3})/
| filter status >= 500
| stats count(*) as errors,
        count_distinct(@logStream) as instances
  by url, status
| sort errors desc
| limit 20
```

Single query reveals "which URL, which status code, how many requests, how many instances." One instance erroring suggests instance problem; all instances equally indicates backend (DB, downstream) issue.

### 2. Lambda Cold Start percentage trend

```sql
filter @type = "REPORT"
| stats count(*) as total,
        sum(strcontains(@message, "Init Duration")) as coldStarts,
        (coldStarts / total * 100) as coldStartPct
  by bin(5m)
| sort @timestamp asc
```

Cold Start percentage spike suggests: (a) traffic increase spawning new containers, (b) insufficient Provisioned Concurrency, (c) immediate post-memory-upgrade container recreations.

### 3. Lambda p50 / p95 / p99 response time trend

```sql
filter @type = "REPORT"
| stats avg(@duration) as avg,
        pct(@duration, 50) as p50,
        pct(@duration, 95) as p95,
        pct(@duration, 99) as p99,
        max(@duration) as max
  by bin(5m)
| sort @timestamp asc
```

Average hides long tail. Sudden p99 spike means some users' very bad experience. Exam "some users slow" scenarios almost always answer with p99 query.

### 4. Lambda memory usage — over/under-provision diagnosis

```sql
filter @type = "REPORT"
| stats max(@maxMemoryUsed) as peakMb,
        avg(@maxMemoryUsed) as avgMb,
        max(@memorySize) as allocatedMb,
        (peakMb / allocatedMb * 100) as peakUsagePct
  by @functionName
| filter peakUsagePct < 40 or peakUsagePct > 90
```

`peakUsagePct < 40` → over-provision (waste). Cut 50% for cost savings.
`peakUsagePct > 90` → undersized (OOM risk). Increase for stability.

### 5. VPC Flow Logs REJECT traffic analysis — SG/NACL debugging

```sql
fields @message
| parse @message "* * * * * * * * * * * * * *"
  as ver, accId, eni, src, dst, srcPort, dstPort, proto, packets, bytes, start, end, action, logStatus
| filter action = "REJECT"
| stats sum(bytes) as totalBytes,
        count(*) as flows,
        count_distinct(dst) as uniqueDestinations,
        count_distinct(dstPort) as uniquePorts
  by src
| sort totalBytes desc
| limit 30
```

Instantly identify "which IP most rejected." Bot scan → rejected IPs widespread (large uniqueDestinations); legit traffic misconfigured SG → narrow range (specific server + port).

### 6. CloudTrail IAM permission denial patterns

```sql
fields eventTime, eventName, errorCode, errorMessage,
       userIdentity.arn, userIdentity.sessionContext.sessionIssuer.userName,
       sourceIPAddress
| filter errorCode = "AccessDenied" or errorCode = "UnauthorizedOperation"
| stats count(*) as denials,
        count_distinct(eventName) as actions
  by userIdentity.arn, sourceIPAddress
| sort denials desc
| limit 50
```

Instantly see who attempts which APIs how often due to insufficient permissions. Diverse denials from one user in short time → suspected breach; single API repeated denials from automation → missing IAM policy.

### 7. Specific user recent activity tracking — security incident response

```sql
fields eventTime, eventName, sourceIPAddress, awsRegion,
       resources.0.ARN, requestParameters
| filter userIdentity.userName = "intruder-suspect"
   or userIdentity.arn like /intruder-suspect/
| sort eventTime desc
| limit 200
```

All API calls by suspected intruder/account chronologically. Standard incident response query used with GuardDuty findings.

### 8. Sudden Top user_id by request count — user surge detection

```sql
parse @message /user_id=(?<userId>[0-9a-f-]+)/
| stats count(*) as requests by userId
| sort requests desc
| limit 30
```

Identify bots, scrapers, over-usage. EMF metadata fields with user_id make this query instantly effective.

### 9. RDS Performance Insights style — slow query detection

```sql
filter @message like /Query_time/
| parse @message /Query_time:\s+(?<qtime>\d+\.\d+)/
| parse @message /SET timestamp=\d+;\s*(?<query>.*?)(?=;|$)/
| filter qtime > 1.0
| stats count(*) as occurrences,
        avg(qtime) as avgSeconds,
        max(qtime) as maxSeconds
  by query
| sort occurrences desc
| limit 20
```

When RDS slow query log reaches CloudWatch Logs, sort queries > 1 second by frequency.

> 🔍 **Deeper context**: `parse` command extracts fields from message via regex (named capture `(?<name>...)`) or glob (`*` wildcard). Incorrect regex fails match → subsequent stats empty. Operator debug tip: first confirm `parse` result with `display` or `fields` before adding `stats`. If `parse` result fields unrecognized in subsequent `filter`, re-check `parse @message ... as ...` syntax — common mistake is invoking result fields in contexts where not auto-available.

## Insights Query Performance and Cost Optimization

Insights bills by GB scanned ($0.0076/GB Seoul). 5 operator cost-saving patterns:

1. **Minimize time range**: Reducing 1 week → 1 hour cuts cost 168-fold. Step expansion — 1hr → 6hr → 24hr
2. **`filter` earliest**: Filter during scan, not after. Optimizer push-down
3. **Explicit `fields`**: Don't load unnecessary fields
4. **Prefer indexed fields**: `@timestamp`, `@logStream`, `@log` indexed, fast
5. **Narrow Log Group**: Multiple queryable but narrower faster

```sql
-- Inefficient: load all fields, scan entire message
fields @timestamp, @message, @logStream, @ingestionTime, @log
| filter @message like /ERROR/

-- Efficient: only needed fields, filter early
fields @timestamp, @message
| filter @message like /ERROR/
```

> 💡 **Related theory**: Insights is distributed query engine pattern. Multiple workers scan partial Log Streams, merge results (MapReduce). But row-oriented (Log line) not columnar (Parquet) storage limits column pruning. Time partitioning most impactful optimization. Bulk analysis (TB+) → Athena (Parquet columnar + Glue Catalog partitions) overwhelmingly faster/cheaper. Operator standard: "real-time debugging = Insights / bulk analysis = Athena."

## Live Tail: Real-Time Monitoring (Launched 2023)

**Live Tail**, launched 2023, real-time streaming unlike Logs Insights. `tail -f` user experience.

```bash
aws logs start-live-tail \
  --log-group-identifiers arn:aws:logs:ap-northeast-2:111:log-group:/aws/lambda/myfn \
  --log-event-filter-pattern "ERROR"
```

Standard tool when operators want real-time post-deployment logs or immediate new error visibility during incidents. Console also has "Live Tail" tab for GUI. But per-session per-minute cost ($0.01/session·minute), so close after debugging.

## CloudWatch Logs Anomaly Detection (Launched 2023)

Unlike Metrics Anomaly Detection, **detects log pattern anomalies themselves** via ML. Unseen patterns, suddenly changed frequency auto-alert.

```
[Learned normal patterns]
"INFO Started processing order=*"
"INFO Order * completed in *ms"
"WARN Retry attempt * for order *"

[Anomaly detection]
"FATAL Database connection lost"  ← Unseen pattern, alarm
"INFO Started processing order=*" (frequency 10x normal) ← Abnormal frequency, alarm
"java.lang.OutOfMemoryError: Java heap space" ← New exception pattern
```

ML auto-handles without manual Metric Filter creation. But learning needs minimum days~weeks, so immediate new workload application not recommended. False positives possible until stable baseline established.

> 🔍 **Deeper context**: Logs Anomaly Detection internally **clusters log patterns** (Drain algorithm family presumed), grouping similar logs as one pattern, then detects anomalies in frequency/timing via STL/ARIMA (2-step ML pipeline). Operators need not hand-code regex; ML auto-determines "these logs same type."

## Embedded Metric Format (EMF): Metrics and Logs Integration

Common operator pattern: application publishes metrics via `PutMetricData`, API costs explode. EMF is solution.

EMF embeds metrics as JSON in log messages; CloudWatch auto-extracts to metrics.

```json
{
  "_aws": {
    "Timestamp": 1716700000000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp/Orders",
      "Dimensions": [["Service", "Env"]],
      "Metrics": [
        {"Name": "ProcessingLatency", "Unit": "Milliseconds"},
        {"Name": "OrderValue", "Unit": "None"},
        {"Name": "ErrorCount", "Unit": "Count"}
      ]
    }]
  },
  "Service": "checkout",
  "Env": "prod",
  "ProcessingLatency": 234,
  "OrderValue": 49.99,
  "ErrorCount": 0,
  "user_id": "u-12345",
  "order_id": "o-67890",
  "trace_id": "1-5759e988-bd862e3fe1be46a994272793"
}
```

Log this JSON with `console.log` (JavaScript) or `print` (Python):

- Stored as log in CloudWatch Logs (searchable)
- ProcessingLatency, OrderValue, ErrorCount auto-extracted as metrics
- user_id, order_id, trace_id are log fields (not metric dimensions; avoid cardinality issues)
- Zero `PutMetricData` API calls

> 📚 **Case study**: Company called `PutMetricData` 3 times per HTTP request (latency, error_count, order_value), API cost $8,000/month. After EMF, API cost zero. Log cost rose slightly (~50%) but metric cost savings overwhelming. Exam: "cost-efficient metric publishing" almost always → EMF.

> 🔍 **Deeper context**: EMF integrated in AWS SDK **PowerTools** (Python, Java, TypeScript, .NET). Python: `from aws_lambda_powertools import Metrics`. CloudWatch async-parses EMF JSON, publishes metrics free. Metric extraction latency is minutes (usually 1-2min). Immediate metric response alarms better suited to direct PutMetricData, but rare.

## CloudWatch Logs Cross-Account Observability (2022)

To view metrics and logs from multiple accounts in one console, use **CloudWatch Observability Access Manager**.

```
[Monitoring Account] ← Operations team viewing account
   │ Enable Sink
   │
   ├── Source Account A metrics, logs, X-Ray auto-sync
   ├── Source Account B
   └── Source Account C
```

Operator pattern: Create separate Monitoring Account, connect sink from all workload accounts. View all-account metrics, logs, X-Ray traces in one console. Auto-enrollment for entire Organization available; new accounts auto-connect.

## Summary

Logs Insights is operator's SQL. `parse + filter + stats` 3 commands solve 90% of debugging. Narrow time range start, early filter placement key to cost/speed. EMF unifies metrics/logs for cost and observability. When 3am alert arrives, having these 9 patterns memorized lets you narrow root cause in 10 minutes.

Tomorrow: Metric Filter, EMF deep-dive + Anomaly Detection operational patterns.

---

## 📝 연습 문제

**문제 1.** To view Lambda p99 response time trend at 5-minute intervals, which query is correct?

A) `filter @type = "REPORT" | stats avg(@duration)`
B) `filter @type = "REPORT" | stats pct(@duration, 99) as p99 by bin(5m)`
C) `stats max(@duration)`
D) `parse @message | stats sum(@duration)`

**정답: B**
해설: Lambda REPORT lines include auto-discovered `@duration` field. `pct(@duration, 99)` calculates percentile. `bin(5m)` groups by 5-minute intervals for trend analysis. Average (A) hides long tail; max (C) sensitive to single outliers.

---

**문제 2.** API bill soared calling PutMetricData per HTTP request. Most suitable alternative?

A) Batch PutMetricData calls
B) Embedded Metric Format (EMF) — single console.log auto-extracts metrics, zero API cost
C) Store metrics in S3, batch-publish hourly
D) CloudWatch Logs Subscription Filter

**정답: B**
해설: EMF embeds JSON metrics in logs; CloudWatch auto-extracts. Zero API cost. PowerTools library (Python/Java/TS) auto-generates. Exam: "cost-efficient metrics" almost always → EMF.

---

**문제 3.** Insights query over 1-week range too slow/expensive. Most effective improvement order?

A) Select all fields with `fields *`
B) Narrow time range, move `filter` early, specify needed `fields` only
C) Add `sort`
D) Reduce Log Group scope

**정답: B**
해설: Insights bills by GB scanned. Time range reduction + filter pushdown + needed fields only most effective. 1hr → 6hr → 24hr step expansion standard.

---

**문제 4.** Two core EMF advantages?

A) PutMetricData API cost zero
B) Freely use high-cardinality fields (user_id) as metric dimensions
C) Integrate metrics + logs as single JSON. Same trace_id instantly connects metric anomaly ↔ source log
D) Metrics retained permanently

**정답: A, C**
해설: EMF single console.log line auto-extracts metrics (no API cost) + unifies metrics/logs (same JSON contains trace_id, user_id context). High-cardinality fields only as log fields, not dimensions (prevent cardinality explosion). Metric retention same for EMF or PutMetricData (15 months).

---

**문제 5.** Query to track Lambda Cold Start percentage at 5-minute intervals?

A) `filter @message like /COLD/`
B) `filter @type = "REPORT" | stats sum(strcontains(@message, "Init Duration")) / count(*) * 100 as coldPct by bin(5m)`
C) `select cold_start_count from logs`
D) Not possible in Logs Insights; use X-Ray

**정답: B**
해설: Lambda REPORT lines detect cold start by "Init Duration:" text presence (absent in warm start). Alternatively use auto-discovered `@initDuration` field: `filter @initDuration > 0 | stats count(*) by bin(5m)`. Track ratio by time bins.

---

**문제 6.** Identify Lambda memory over-provisioning?

A) `filter @type = "REPORT" | stats max(@maxMemoryUsed) / max(@memorySize) * 100 as peakPct by @functionName | filter peakPct < 40`
B) X-Ray trace
C) AWS Compute Optimizer (requires 14+ days data)
D) Both A and C standard methods

**정답: D**
해설: Insights immediate analysis via A. AWS Compute Optimizer learns 14+ days, auto-recommends. Both standard; company maturity determines choice. Compute Optimizer frequent SOA-C02 topic (managed cost optimization service).

---

**문제 7.** View metrics and logs from multiple accounts in one console?

A) Log into each account console individually
B) CloudWatch Cross-Account Observability + Monitoring Account Sink, connect Source from workload accounts
C) Export all logs to S3, query Athena
D) Consolidate all account IAM Roles

**정답: B**
해설: CloudWatch Observability Access Manager (2022): Sink in Monitoring Account, Source connection from workload accounts. One console unified metrics/logs/X-Ray traces across all accounts. Organization-wide auto-enrollment option available.

---

**문제 8.** Analyze VPC Flow Logs via Insights to find IP most REJECT'd?

A) `filter action = "REJECT" | stats count(*) by srcaddr`
B) `parse @message "* * * * * * * * * * * * * *" as ... | filter action = "REJECT" | stats sum(bytes) by src | sort sum desc`
C) Athena query
D) X-Ray

**정답: B**
해설: VPC Flow Logs space-delimited text requires `parse` to extract fields. Simple `action = "REJECT"` doesn't auto-recognize field name inside @message (pre-parse it's single string). Bulk analysis → S3 + Athena more efficient, but Insights usage → answer B.

