# Day 2 - CloudWatch Logs: Groups, Streams, Subscriptions, and Insights Deep Dive

Logs are the operational black box. When something goes wrong, they're nearly the only primary evidence of "what happened." But in distributed systems, logs immediately become a problem. Hundreds of Lambda functions, thousands of containers, on-premises servers all vomiting logs — where do you collect them, how do you order them chronologically, how do you search them, how do you catch specific patterns real-time, and — most practically — how do you control exploding log costs? CloudWatch Logs is the central sink where almost every AWS service streams logs, and on top of it sit real-time routing (Subscription), metric extraction (Metric Filter), and interactive analysis (Insights).

Today we go inside this log pipeline. Not just "logs split into groups and streams," but why this two-layer hierarchy exists, how Subscription Filters stream logs nearly real-time elsewhere, how the Logs Insights query engine works and why it charges by scan volume, why logs are so expensive, and how to tame that cost. In DOP-C02 exams, logs appear every test as scenarios: "real-time OpenSearch ingestion," "alarms from external NGINX logs," "multi-account central aggregation," "controlling runaway log costs."

## Log Group and Log Stream — Why Two Layers

CloudWatch Logs' most basic structure is two tiers: **Log Group** and **Log Stream**. Many see this as just folder/file, but this two-layer split has a clear purpose.

**Log Group** is the logical unit — usually one application or service (`/aws/lambda/MyFn`, `/ecs/checkout`). Retention policy (retention), encryption key (KMS), access permissions, metric filters, and subscription filters all hang at **group level**. That is, the group is "the unit of policy."

**Log Stream** is the physical unit — a single log source (specific Lambda invocation, specific EC2, specific container). Log events are accumulated chronologically within the stream.

Why does this split matter? **The ordering boundary is the stream.** CloudWatch guarantees event time order within one stream, but not across different streams. If all sources mixed into one stream, multiple sources writing simultaneously would tangle the order and create write contention. Put sources in separate streams, each writes sequentially to its own, and the group bundles these streams under one policy umbrella.

> 💡 **Related Theory**: Log Group/Stream's two-tier structure is a universal pattern in distributed logging. Apache Kafka's topic/partition is exactly the same idea—topic is the logical unit (policy, consumer group), partition is the physical unit guaranteeing order. Kafka guarantees "order within partition only," just as CloudWatch guarantees "order within stream only." The essence is the **trade-off between parallel write throughput and ordering guarantee**. Partition per source enables parallel writes and raises throughput, while keeping causal order within each source. You give up total global order to gain scalability—classic distributed systems trade-off.

## Retention — The Cost Trap the Default Creates

Create a Log Group and the default retention policy is **Never Expire (unlimited)**. This is the most common and costliest trap. Without explicit retention, logs pile up forever and CloudWatch Logs storage costs accumulate endlessly.

```bash
aws logs put-retention-policy \
  --log-group-name /aws/lambda/MyFn \
  --retention-in-days 14
```

Retention values are discrete: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653 days (or never). Only these fixed values, no arbitrary days.

> ⚠️ **Trap**: In organizations running tens to hundreds of Lambda functions, auto-created Log Groups (`/aws/lambda/<function-name>`) default to unlimited retention. Developers just deploy the function and don't set retention separately. After a year, un-viewed debug logs pile up to terabytes, and monthly storage bills become substantial. The solution is org-level automation—detect new Log Group creation via EventBridge and Lambda auto-applies retention, or AWS Config rules catch "Log Group without retention" as non-compliant and auto-remediate. "Default is cost-worst" must be remembered.

## Subscription Filter — Real-Time Log Streaming Pipe

If Logs Insights is "search stored logs post-event," Subscription Filter is the opposite: **stream logs real-time to elsewhere the instant they arrive**. This transforms CloudWatch Logs from mere storage into a real-time event source.

```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name ErrorAlerts \
  --filter-pattern '?ERROR ?Exception' \
  --destination-arn arn:aws:lambda:...:function:ErrorRouter
```

Destinations come in three varieties. **Lambda** (custom processing—parse errors to Slack), **Kinesis Data Streams** (high-throughput fan-out—multiple consumers parallelize log ingestion), **Kinesis Data Firehose** (managed buffer with S3·OpenSearch·Splunk·Datadog delivery). Choice of destination shapes the pipeline.

Filter Pattern is shared subscription/metric filter syntax, surprisingly powerful:

- Simple text: `"ERROR"` — lines containing this string
- Multiple OR: `?ERROR ?WARN` — ERROR or WARN
- JSON matching: `{ $.statusCode = 500 }` — specific key-value in JSON logs
- Space-delimited fields: `[ip, id, user, time, request, status_code=5*, ...]` — positional NGINX-style logs

> 🔍 **Deeper**: The destination choice reflects processing models. **Direct Lambda** simplest but risky on burst traffic—log tsunami can throttle Lambda concurrency. **Kinesis Data Streams** absorbs spikes with shard buffering and fans to multiple consumers, but requires shard management. **Kinesis Firehose** fully managed buffer, easiest for S3·OpenSearch batching, no shard overhead but batches incur minute-scale delay. General rule: simple transform/route→Lambda, high-throughput multi-consumer→Data Streams, storage/search ingestion→Firehose. Limited subscription filters per Log Group, so multi-destination typically goes through Data Streams for fan-out.

## Metric Filter — Mining Numbers from Logs

While Subscription Filter routes logs outward, Metric Filter **extracts numbers from log lines and converts them to CloudWatch metrics**, then you can alarm on those metrics.

```bash
aws logs put-metric-filter \
  --log-group-name nginx-access \
  --filter-name 5xxCount \
  --filter-pattern '[ip, id, user, time, request, status_code=5*, size, ...]' \
  --metric-transformations \
    metricName=5xxErrors,metricNamespace=NginxLogs,metricValue=1
```

This filter increments the `5xxErrors` metric by 1 for each NGINX access log line where the 6th field (status_code) starts with 5. Now alarm on this metric and you have "notify on NGINX 5xx surge."

The relationship with EMF from yesterday matters. **For brand-new code you write, EMF is the answer**—log and metric together in one emit. But for **external logs where you can't change format** (NGINX·Apache·syslog), Metric Filter is standard. EMF=my application, Metric Filter=someone else's format division of labor.

> 💡 **Related Theory**: Metric Filter is a form of **stream processing**—real-time pattern matching and windowed aggregation over infinite log streams. Apply patterns to flowing events, increment counters on match—this is stream windowed aggregation. Lineage: Logstash grok filters + metric output, Splunk search-time extraction, Fluentd/Fluent Bit filter plugins. Core idea: trade-off **schema-on-write (structure at ingest) vs. schema-on-read (structure at query)**. Metric Filter evaluates patterns at ingest (schema-on-write lean), pre-making metrics, so alarms are immediate but only for pre-defined patterns. Logs Insights (schema-on-read) is flexible but post-search.

## Logs Insights — Interactive Log Query Engine

For post-event log exploration, use Logs Insights. Not SQL but a pipe-based (`|`) query language.

```
fields @timestamp, @message
| filter level = "error"
| stats count() by service
| sort count desc
| limit 20
```

`fields`(display fields) → `filter`(WHERE clause) → `stats`(aggregation: count/sum/avg/percentile) → `sort` → `limit`, plus `parse` for regex extraction. JSON logs auto-parse keys like `level`, `service` available for filtering/aggregation.

Two core constraints. **You must specify time range** (doesn't scan all logs), and **billing is by data scanned (GB)**. Per-GB-scanned cost is charged.

> 🔍 **Deeper**: Logs Insights' "charge-by-scan" exists because the engine is fundamentally a **distributed full scan**. Unlike Elasticsearch/OpenSearch with pre-built inverted indices, Insights reads the specified time range's logs in parallel at query time, filters and aggregates (same model as Athena scanning S3, BigQuery scanning columns). Advantage: no index maintenance cost, arbitrary queries free. Downside: scan scope determines cost/latency linearly. So narrow time range and apply `filter` early—core to performance and cost. Conversely, if you need always-fast text search, stream logs to OpenSearch for inverted indexing—it's pull-now-scan (Insights) vs. pay-upfront-index (OpenSearch) trade-off.

## Live Tail — Real-Time Debugging

If Logs Insights is post-analysis, **Live Tail** is the cloud `tail -f`—stream logs as they arrive real-time. Right after deploy or mid-incident: "what's happening now?"

```bash
aws logs start-live-tail \
  --log-group-identifiers arn:aws:logs:...:log-group:/aws/lambda/MyFn
```

Session has time limits, can filter specific patterns. Insights (post-stats) and Live Tail (real-time watch) are two interfaces to same log data—one asks "what happened," the other "what's happening now."

## Cross-Account Logs — Two Eras of Multi-Account Aggregation

Large orgs have tens of accounts. Logs must go to one place; AWS solved this in two generations.

**1st Gen — Subscription Destination.** Central account makes a receive endpoint (usually Kinesis Data Stream) with `put-destination`, grants source account access with `put-destination-policy`. Source accounts attach subscription filters to their Log Groups pointing to that destination ARN.

```bash
# Central (receive) account
aws logs put-destination \
  --destination-name CrossAcctDest \
  --target-arn arn:aws:kinesis:...:stream/CentralLogStream \
  --role-arn arn:aws:iam::...:role/CWLogsToKinesisRole
aws logs put-destination-policy \
  --destination-name CrossAcctDest \
  --access-policy '{...source account allow...}'

# Source account
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name CentralizeLogs --filter-pattern '' \
  --destination-arn arn:aws:logs:...:destination:CrossAcctDest
```

**2nd Gen — Cross-Account Observability (2023+).** Much simpler. Monitoring account creates a Sink, source accounts trust it, then monitoring account console sees source logs/metrics/traces aggregated. No separate Kinesis pipeline—direct console view. One-way: sources can't see monitoring account data.

The purposes differ. 1st gen for **physically moving/processing/re-ingesting logs** (e.g., central data lake S3, central OpenSearch). 2nd gen for **viewing/searching without moving**.

## Log Costs — Why So Much and How to Tame

Behind every log decision: cost. CloudWatch Logs cost has three axes: **ingestion (GB), storage (GB-month), Insights queries (scanned GB)**. Ingestion and storage dominate and cost more than S3-like cheap storage.

Standard cost-control patterns are three. First, **keep retention short**—CloudWatch holds recent logs, old ones expire. Second, **long-term logs flow via Firehose subscription to S3 (cheap)**, search via Athena if needed. Third, **structured logs cut volume**—one JSON line with all context is smaller than multiline debug dumps and searches better.

> 📚 **Case Study**: A SaaS company poured DEBUG-level logs from all microservices into CloudWatch with unlimited retention. Traffic grew, log cost exceeded compute cost—yet nobody queried 6-month-old DEBUG logs. Fix: three steps. (1) Production log level raised to INFO (less ingestion). (2) Log Group retention unified to 14 days. (3) Compliance-required long storage routed Firehose → S3 → Glacier. After: log costs dropped to 1/5. Lesson: **most log cost is "keeping logs no one views in expensive places too long,"** fix is level shift (volume) + short retention (time) + S3 cold (storage) combo.

> 🎯 **Scenario**: "Security wants all VPC Flow Log + app logs 7 years (compliance), ops queries only last 2 weeks." CloudWatch 7-year unlimited retention is unaffordable. Answer: tier split. CloudWatch Logs retention 14 days (ops queries), simultaneously Subscription Filter (empty pattern `''` for all) → Kinesis Firehose → S3 for 7-year storage. S3 Lifecycle converts to Glacier/Deep Archive after time, minimizing storage cost. Rare long queries go to Athena directly on S3. "Hot recent in CloudWatch, cold archive in S3"—hot/cold tiering is key.

## Summary

Today's five takeaways. First, **Log Group (policy unit) / Log Stream (order-guarantee unit) two-tier** mirrors Kafka topic/partition as a parallel-write-vs-order compromise. Second, **default retention is unlimited—a cost trap**; org-level auto-retention enforcement is standard. Third, **Subscription Filter routes logs real-time to Lambda/Kinesis/Firehose**; destination choice shapes processing model. Fourth, **Metric Filter extracts metrics from external logs** (NGINX etc), schema-on-write tool dividing labor with EMF. Fifth, **Logs Insights is full-scan engine** (charges by scan data) so time range + early filter are key, cost control is log level (volume) + short retention (time) + S3 cold (storage) combo.

Next we deep-dive Container Insights and Lambda Insights, and EMF. How observability differs by workload type, how EMF multi-dimension combinations work, how cardinality becomes a cost bomb.

---

## 📝 Practice Questions

**Question 1.** Multiple sources (container instances) send logs for the same service. What is the boundary within which CloudWatch guarantees time ordering?

A) The entire Log Group
B) Within a Log Stream — ordering is guaranteed only inside a single stream
C) The entire Region
D) The entire account

**Answer: B**

Explanation: CloudWatch Logs guarantees the time order of events only within a single Log Stream, and does not guarantee it across different streams. This is the same model as Kafka guaranteeing order only within a partition: separating streams per source provides parallel write throughput while preserving causal order within each source. A Log Group (A) is merely a unit for policies, permissions, and filters, not a unit of ordering guarantees.

---

**Question 2.** Log Groups for hundreds of Lambda functions are created automatically, and log costs keep accumulating. What are the root cause and the solution?

A) Excessive Lambda memory — reduce memory
B) Default retention is unlimited — detect new Log Group creation with EventBridge and apply retention automatically, or remediate non-compliance with an AWS Config rule
C) The Region is expensive — change Regions
D) Excessive IAM permissions

**Answer: B**

Explanation: The default retention of Log Groups that Lambda creates automatically is Never Expire (unlimited), so logs pile up forever. The organization-wide solution is to catch new Log Group creation events with EventBridge and have Lambda apply retention automatically, or to detect "Log Groups with no retention" as non-compliant with an AWS Config rule and remediate them automatically. Memory (A), Region (C), and IAM (D) are unrelated to log retention cost.

---

**Question 3.** You want to ingest logs into OpenSearch in real time. What is the MOST appropriate path?

A) Subscription Filter → Kinesis Data Firehose → OpenSearch
B) Export to S3 hourly with an export task, then index manually
C) A Lambda function polls the Log Group every minute
D) S3 sync

**Answer: A**

Explanation: A Subscription Filter routes logs in real time as soon as they arrive, and Kinesis Firehose is a fully managed buffer and the simplest path for batch ingestion into OpenSearch. There is no shard management, and buffering and retries are handled automatically. An export task (B) is a one-time batch and not real time, polling (C) has latency, cost, and throttling problems, and S3 sync (D) does not go directly to OpenSearch.

---

**Question 4.** You want to turn only 5xx responses from external NGINX access logs, whose format cannot be changed, into a metric and set an alarm on it. How?

A) Rewrite the NGINX logs with EMF
B) A Metric Filter `[..., status_code=5*, ...]` + a CloudWatch Alarm on that metric
C) Run Logs Insights manually every 5 minutes
D) X-Ray

**Answer: B**

Explanation: EMF is applied to the application code you write, so it cannot be used for external logs (NGINX, Apache, syslog) whose format cannot be changed. A Metric Filter uses a space-delimited, position-based pattern to match lines whose status_code field starts with 5, extracts a metric, and an alarm is set on that metric. Running Insights manually (C) is not a real-time alarm, and X-Ray (D) is distributed tracing, unrelated to extracting metrics from logs.

---

**Question 5.** Logs Insights query costs are high. What is the most direct way to improve cost and performance?

A) Create more Log Groups
B) Narrow the query's time range and apply `filter` early to reduce the amount of data scanned
C) Increase retention
D) Replace it with Live Tail

**Answer: B**

Explanation: Logs Insights is an engine that performs a full scan of the specified time range at query time without an inverted index, so billing is based on the amount of data scanned. Narrowing the time range and applying `filter` early in the pipe reduces the data to be scanned and processed, lowering both cost and latency. Increasing retention (C) actually raises cost, and Live Tail (D) is for real-time observation and cannot replace after-the-fact statistical queries.

---

**Question 6.** All logs must be retained for 7 years for compliance, but operational queries need only the most recent 2 weeks. What is the cost-optimal design?

A) Retain logs in CloudWatch unlimited for 7 years
B) CloudWatch retention of 14 days + Subscription Filter (all logs) → Firehose → S3, transition to Glacier with S3 lifecycle, and use Athena for long-term queries
C) Manually download all logs every day
D) Keep logs in OpenSearch for 7 years

**Answer: B**

Explanation: Hot/cold tiering is the answer. CloudWatch Logs handles only operational queries with a 14-day retention, while at the same time a subscription filter with an empty pattern streams everything to Firehose → S3 for 7-year retention. S3 transitions to Glacier/Deep Archive through lifecycle rules to minimize storage cost, and infrequent long-term queries run directly against the data with Athena. Retaining 7 years in CloudWatch (A) or in OpenSearch (D) has excessive storage cost, and manual downloads (C) are impractical.

---

**Question 7.** In a multi-account organization, how can you view logs in a central monitoring account as an integrated view, without physically moving or processing them (the modern 2023+ approach)?

A) Subscription Destination + Kinesis (first generation)
B) Cross-Account Observability — a Sink in the monitoring account + links from source accounts for integrated console viewing
C) Copy each account's logs to S3
D) Manually operate a separate dashboard for each account

**Answer: B**

Explanation: With Cross-Account Observability (2023+), when the monitoring account creates a Sink and source accounts link to it, the monitoring account's console provides an integrated view of the source accounts' logs, metrics, and traces without a separate Kinesis pipeline (one-way). The first-generation Subscription Destination (A) is used when physically moving and re-ingesting logs into a central location; for integrated viewing without movement, the second generation is simpler.

---

## 📌 Today's Summary

There are five key takeaways today. First, the two-level structure of Log Group (the unit for policies, permissions, and filters) and Log Stream (the unit of ordering guarantees) is the same trade-off between parallel writes and ordering guarantees as Kafka topics/partitions. Second, the default retention is unlimited, making it a cost trap, and enforcing retention automatically with EventBridge/Config is the standard. Third, a Subscription Filter routes logs in real time to Lambda (simple processing), Kinesis Data Streams (high-throughput fan-out), or Firehose (loading into storage). Fourth, a Metric Filter is a schema-on-write tool that extracts metrics from external logs whose format cannot be changed, and it divides roles with EMF. Fifth, Logs Insights is a full-scan engine without an inverted index (billed by data scanned), so time range and early filtering are key, and log cost control is a combination of adjusting log levels (volume) + short retention (time) + S3 cold storage (storage).
