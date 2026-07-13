# Day 2 - CloudWatch Logs: Internal Structure of Log Groups and Subscription Patterns

Operators always start troubleshooting at logs. Metrics tell you "one indicator is abnormal," but logs tell you "exactly which request caused which exception." That's why CloudWatch Logs is operator tool #1. Simultaneously, it's one service most likely to explode your bill. Set no retention policy and let VPC Flow Logs stream through; you get a $10,000 invoice a month later.

Today we explore the **internal structure, cost structure, retention and search patterns, subscription patterns, and VPC Flow Logs destination choices** of Logs from an operator perspective.

## CloudWatch Logs Data Model

```
Log Group           ← Log container for same application (unit of policy, KMS, retention)
   │
   ├─ Log Stream    ← Time-ordered log sequence from single source (EC2 instance, Lambda execution environment ID)
   │   │
   │   ├─ Log Event ← Actual log record (timestamp + message, max 256KB)
   │   ├─ Log Event
   │   └─ Log Event
   │
   ├─ Log Stream
   └─ Log Stream
```

- **Log Group**: Unit of policy. Retention period, KMS encryption, metric filters, subscriptions, IAM permissions all set at Log Group level
- **Log Stream**: Time-ordered log sequence from single source (instance ID, Lambda execution environment ID, ECS Task ID)
- **Log Event**: Single log line. timestamp(ms) + message(max 256KB) + ingestionTime

Lambda creates 1 Log Group per function (`/aws/lambda/<funcName>`), 1 Stream per execution environment (container) instance. EC2's CloudWatch Agent typically separates Streams by instance ID. ECS Fargate uses task ID, EKS uses pod name; standard practice.

> 🔍 **Deeper context**: Log Stream controls concurrency via **Sequence Token**, a monotonically increasing token. Calling `PutLogEvents` concurrently on one Stream caused one to fail with `InvalidSequenceTokenException`, requiring retry with new token. Starting 2023, new mode (`PutLogEvents` v2) makes sequence tokens optional, enabling concurrent writes. But multiple sources writing to one Stream may break timestamp ordering; "one Stream = one source" remains standard.

> ⚠️ **Pitfall**: Log message max size is 256KB. Oversized JSON gets truncated or rejected. Operators logging entire response bodies lose debug info to truncation. Standard pattern: store large payloads in S3, keep only S3 key in logs.

## Retention Policy: Default Pitfall (Never Expire)

**Log Group default retention = "Never Expire"** (permanent). Without explicit setting, costs grow infinitely. This is one of the most frequent cost scenarios on SOA-C02.

| Retention option | When to use |
|------------------|-------------|
| 1 day | Debug logs, high-volume access logs |
| 3 days | Short-lived debug logs |
| 7-30 days | General application logs |
| 60-90 days | Security audit (CloudTrail usually 90 days recommended) |
| 180 days-1 year | PCI-DSS (1 year), some financial regulations |
| 5-7 years | HIPAA (6 years), SOX (7 years) |
| 10 years | Some government/medical regulations |
| Never Expire | Almost never used (cost explosion) |

```bash
# Set retention bulk — operator First-Day Action
aws logs put-retention-policy \
  --log-group-name /aws/lambda/my-function \
  --retention-in-days 14

# Bulk change all retention=null Log Groups to 30 days
aws logs describe-log-groups --query 'logGroups[?retentionInDays==`null`].logGroupName' --output text \
  | xargs -I {} aws logs put-retention-policy --log-group-name {} --retention-in-days 30
```

> 📚 **Case study**: A company operated 500 Lambda functions for a year. One day they saw the bill: CloudWatch Logs cost $4,000/month alone. All function Log Groups defaulted to "Never Expire." Bulk change to 7-day retention dropped costs 90%. Setting Log Group retention policy standard is #1 First Day Action.

> 🔍 **Deeper context**: Operators use 3 standard patterns to auto-apply retention to all new Log Groups:
>
> 1. **EventBridge rule**: Detect CloudTrail `CreateLogGroup` API event → auto-invoke Lambda → run `put-retention-policy`. Applied immediately at creation.
> 2. **Config Rule**: Managed rule `cloudwatch-log-group-retention-period-check` (parameter `MinRetentionTime`) detects non-compliance + Remediation Action auto-fixes.
> 3. **CloudFormation / Terraform**: IaC Log Group definitions require `RetentionInDays`. But Lambda auto-creates on first run, so pre-create in IaC or miss some.

## Cost Structure: 4 Items Operators Easily Explode

CloudWatch Logs costs consist of 4 items (based on Seoul ap-northeast-2).

| Item | Price | Meaning | Cost threat |
|------|-------|---------|-------------|
| **Ingestion** | $0.76 per GB | Cost to receive and store logs | ★★★★★ (largest) |
| **Storage** | $0.033 per GB/month | Storage cost (3-7x pricier than S3) | ★★★ |
| **Insights Query** | $0.0076 per GB scanned | Query execution cost | ★★ |
| **Data Transfer** | Standard rate | To other regions, internet | ★ |

**Ingestion dominates overwhelmingly**. So "reducing log volume" is priority #1 for cost savings.

> ⚠️ **Pitfall**: Streaming VPC Flow Logs to CloudWatch Logs explodes Ingestion costs. Large VPC: tens of GB~TBs daily average. $10,000-$50,000/month is common. **Send VPC Flow Logs to S3** — cost and analysis standard. CloudWatch Logs only for real-time alerting needs.

### VPC Flow Logs Destination Comparison

| Destination | Ingestion cost | Storage cost | Analysis tool | When to use |
|-------------|-------------------|---------------|--------------|-------------|
| **CloudWatch Logs** | $0.50 per GB | $0.03 per GB/month | Logs Insights | Real-time alerts |
| **S3** | $0.50 per GB (collection) | $0.025 per GB/month | Athena | Long-term retention, bulk analysis |
| **Kinesis Data Firehose** | Firehose rate | Depends on destination | Splunk, OpenSearch | External SIEM |

Surface prices look similar, but **analysis: Logs Insights $0.0076 per GB scanned; Athena $5/TB (i.e., $0.005 per GB)**. Athena overwhelmingly cheaper for bulk analysis.

## Log Subscription Filter: Real-Time Log Processing Pipeline

Subscriptions deliver new Log Group logs real-time to other services. 4 common destinations operators use:

| Destination | When to use |
|-------------|-------------|
| **Lambda** | Log pattern match → auto-alert, auto-remediation |
| **Kinesis Data Streams** | Real-time fan-out to other systems, multiple consumers |
| **Kinesis Data Firehose** | Batch load to S3 / Redshift / OpenSearch |
| **OpenSearch Service** | Search, dashboards (formerly ElasticSearch) |

```
[Log Group]
    │ (real-time streaming)
    ▼
[Subscription Filter] ← Filter by pattern like "ERROR"
    │
    ├─→ Lambda     ← Slack/PagerDuty alerts, EC2 auto-restart
    ├─→ Kinesis DS ← Splunk/Datadog external SIEM
    ├─→ Firehose   ← S3 long-term archival
    └─→ OpenSearch ← Kibana dashboards
```

### Subscription Filter Pattern Examples

```
"ERROR"                              # Word match
"[ip, user_id, status=5*, ...]"      # Space-delimited field match (5xx only)
{ $.statusCode = 5* }                # JSON path match
{ $.level = "ERROR" && $.latency > 1000 }  # AND condition
{ ($.statusCode = 5*) || ($.statusCode = 4*) }  # OR condition
```

> 🔍 **Deeper context**: Subscription Filter is push-based, so latency is seconds. But one Log Group has **max 2 Subscription Filters** (from 2023). Need more → send to Kinesis Data Streams once, multiple consumers read from it (fan-out pattern). Another pitfall: Subscription Filter applies **only to new arriving logs** (forward-only). To retroactively process old logs, separate export task needed.

> 📚 **Case study**: A company built automation detecting "Out of Memory: Kill process" in EC2 syslog → Lambda auto-restarts instance + Slack alerts. Average downtime dropped from minutes to seconds. Additionally, same Lambda published alarm occurrence count as metric, auto-identifying instance types suffering repeated OOM → next deployment switches to larger memory type. Closed-loop operational automation.

### Cross-Account Subscription

To receive another account's Log Group into your account's Kinesis, create **Log Destination** resource and cross-account IAM Trust.

```
[Account A: Source]              [Account B: Analysis Account]
  Log Group                        Log Destination (Kinesis)
    │ Subscription Filter             │
    └──────────► Kinesis DS ◄─────────┘
                  │
                  ▼
                Lambda/OpenSearch
```

Account B must attach Resource Policy to Destination allowing `logs:PutSubscriptionFilter`. This pattern answers the frequent exam scenario: "analyze logs from multiple accounts real-time in central security account."

## CloudWatch Logs vs EventBridge Difference

Two tools operators often confuse.

| Tool | Processes | When to use |
|------|-----------|-------------|
| **CloudWatch Logs Subscription Filter** | Log message (text) patterns | Application log ERROR etc. |
| **EventBridge (CloudWatch Events)** | AWS API call events (CloudTrail-based) or custom events | "S3 object created," "EC2 state changed" — structured events |
| **CloudWatch Alarm** | Metric threshold exceeded | "CPU exceeded 80%" — threshold-based |

"Run Lambda when S3 object created" → S3 Event Notification or EventBridge. "Alert when ERROR appears in Lambda logs" → Logs Subscription Filter or Metric Filter → Alarm. "EC2 CPU exceeds 80%" → CloudWatch Alarm. Clear boundaries prevent exam confusion.

## Log Insights: Operator's SQL

CloudWatch Logs Insights queries logs and aggregates with SQL-like language. Preview common operator patterns.

```sql
-- 1) Top 100 ERROR logs in last 10 minutes
fields @timestamp, @message, @logStream
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

-- 2) Lambda per-function average/max/p99 Duration
filter @type = "REPORT"
| stats avg(@duration), max(@duration), pct(@duration, 99) by bin(5m)

-- 3) ALB access logs top URLs with 5xx response
parse @message "* * * * * * * * * * \"* * HTTP*\" * *"
  as time, elb, client, target, req_proc, target_proc, resp_proc,
     elbStatus, targetStatus, recvBytes, sentBytes, method, url, ver, ua, sslCipher
| filter elbStatus >= 500
| stats count() as errors by url
| sort errors desc
| limit 20

-- 4) Top user_id by request count (per-user analysis)
fields @message
| filter @message like /user_id/
| parse @message "user_id=*" as userId
| stats count(*) as requests by userId
| sort requests desc
| limit 50

-- 5) REJECT traffic in VPC Flow Logs
fields @message
| parse @message "* * * * * * * * * * * * * *"
  as ver, accId, eni, src, dst, srcPort, dstPort,
     proto, packets, bytes, start, end, action, logStatus
| filter action = "REJECT"
| stats sum(bytes) as totalBytes by src, dst
| sort totalBytes desc
| limit 30
```

> 🔍 **Deeper context**: Logs Insights internally **parallelizes queries across multiple workers**. Depending on Log Group size, dozens-to-hundreds of workers each scan part of Log Streams and merge results (MapReduce pattern). So even TB-scale logs query completes in 10-30 seconds. But **cost is by GB scanned ($0.0076 per GB)**, making these 3 principles key:
> 1. **`filter` early**: Filter during scan, not after
> 2. **Narrow time ranges**: Reducing 1 week → 1 hour cuts cost 168-fold
> 3. **Specify `fields`**: Don't load unnecessary fields

> 💡 **Related theory**: Same family as MapReduce (Dean & Ghemawat, 2004 OSDI) distributed processing paradigm. Query = multiple mappers output partial results → reducer merges. Apache Spark, Presto, BigQuery use same structure. Logs Insights limitation: logs are row-oriented (line) storage, no column pruning. Bulk analysis: Athena (Parquet columnar storage) overwhelmingly faster and cheaper.

> ⚠️ **Pitfall**: Setting time range to "1 week" scans all logs for 1 week. Loss on both cost and speed. Operators always start with narrowest possible range and gradually widen. 1 hour → 6 hours → 24 hours progression.

## VPC Flow Logs and Logs Integration Pattern

For real-time analysis of VPC traffic logs, choose CloudWatch Logs or S3. Operator decision tree.

```
                  VPC Flow Logs
                       │
        ┌──────────────┴───────────────┐
        │                              │
   "Real-time alerts needed"      "Long-term retention, bulk analysis"
        │                              │
        ▼                              ▼
   CloudWatch Logs                    S3
        │                              │
        │ Logs Insights                │ Athena
        │ Subscription Filter          │ Glue Catalog
        │ Metric Filter → Alarm        │ Lake Formation
        ▼                              ▼
   Real-time debugging                 Ad-hoc bulk analysis
```

S3 + Athena pattern is cost-effective. Common Athena query:

```sql
-- S3 + Athena analyze REJECT traffic
SELECT srcaddr, dstaddr, dstport, SUM(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE action = 'REJECT'
  AND date_partition = '2025-05-26'
GROUP BY srcaddr, dstaddr, dstport
ORDER BY total_bytes DESC
LIMIT 30;
```

One query instantly reveals "which IP is being blocked by which IP." Standard for SG/NACL debugging.

## Export Logs to S3: Two Methods

For long-term retention and cost savings, send Logs to S3 two ways.

### 1. Manual Export (`CreateExportTask` API)

```bash
aws logs create-export-task \
  --log-group-name /aws/lambda/my-function \
  --from 1716700000000 --to 1716800000000 \
  --destination my-logs-archive \
  --destination-prefix exports/my-function/
```

One-time batch. Takes 5+ minutes. Operators run quarterly/semi-annually for compliance audit prep.

### 2. Subscription Filter → Kinesis Firehose → S3 (Real-Time Streaming)

```
[Log Group]
    │ (Subscription Filter)
    ▼
[Kinesis Data Firehose]
    │ (buffering + compression + partitioning)
    ▼
[S3 with lifecycle: Standard → IA → Glacier Deep Archive]
```

Operator standard. Firehose auto-handles buffering (usually 5min or 5MB), compression (Gzip or Parquet), partitioning (`year=2025/month=05/day=26/`). Then query S3 with Athena ad-hoc.

Cost comparison: CloudWatch Logs Storage ($0.033/GB) → S3 Standard ($0.025/GB) → S3 Glacier Deep Archive ($0.00099/GB) reduces cost to 1/33.

> 📚 **Case study**: A financial company had 7-year audit log retention requirement, spending $15,000/month on CloudWatch Logs. After switching to Subscription → Firehose → S3 Standard 1 year → Glacier Deep Archive 6 years lifecycle, monthly cost dropped to $400. 38x savings. Single biggest change operators make to reduce retention costs.

## Logs Anomaly Detection (Launched 2023)

**Log Anomaly Detection**, launched December 2023, ML-learns Log patterns themselves to auto-detect anomalies. Where Metrics Anomaly Detection sees "numeric abnormality," this sees "log pattern abnormality."

```
[Learned normal patterns]
"INFO Started processing order=*"
"INFO Order * completed in *ms"
"WARN Retry attempt * for order *"

[Anomaly detection]
"FATAL Database connection lost"             ← Unseen pattern, alarm
"INFO Started processing order=*"            ← Same pattern but 10x normal frequency, alarm
```

Operators need not manually create Metric Filters; ML auto-learns baselines. But learning needs minimum days~weeks, so immediate application on new workload not recommended.

## CloudWatch Logs Cross-Account Observability (Launched 2022)

To view logs, metrics, X-Ray from multiple accounts in one console, use **CloudWatch Observability Access Manager**.

```
[Monitoring Account] ← Operations team viewing account
   │ Enable Sink
   │
   ├── Source Account A metrics, logs, X-Ray auto-sync
   ├── Source Account B
   └── Source Account C
```

Operator pattern: Create separate Monitoring Account and connect sink from all workload accounts. Operators view all-account metrics, logs, X-Ray traces in one console. Auto-enrollment for entire Organization is optional.

## Summary

CloudWatch Logs operator checklist:

1. **Apply retention policy to all Log Groups**: Never Expire forbidden. First-Day Action #1
2. **VPC Flow Logs to S3**: Prevent CloudWatch cost explosion. Real-time alerts only for some patterns via CloudWatch
3. **Subscription Filter for real-time automation**: ERROR pattern → Lambda → Slack/auto-remediate
4. **Logs Insights: narrow time range, filter pushdown**: Cost and speed
5. **Long-term archival: S3 + Athena + Glacier lifecycle**: Cost to 1/33
6. **Cross-Account: Observability Access Manager**: Separate Monitoring Account pattern

Tomorrow: Deeper Logs Insights query language — build library of troubleshooting patterns operators use daily.

---

## 📝 연습 문제

**문제 1.** Running 500 Lambda functions, CloudWatch Logs costs exploded. Most effective first action?

A) Reduce console.log in function code
B) Set retention period for all Log Groups to 7-30 days via `put-retention-policy` bulk. Auto-apply new Log Groups via EventBridge or Config Rule
C) Compress all logs
D) Immediately move logs to S3

**정답: B**
해설: Log Group default is "Never Expire" — permanent accumulation. Bulk retention policy most impactful single change. Then follow up with code-level log reduction or S3 export. Standard pattern: EventBridge detects `CreateLogGroup` API → auto-apply policy. Auto-remediation via Config Rule also effective.

---

**문제 2.** VPC Flow Logs need real-time operator view; traffic averages 100GB/day. Where to send for cost and analysis?

A) CloudWatch Logs (Ingestion + Storage + Insights)
B) S3 (long-term retention) + Athena (ad-hoc query)
C) Kinesis Data Streams + Lambda
D) DynamoDB

**정답: B**
해설: VPC Flow Logs high-volume → CloudWatch Logs Ingestion ($0.76/GB) + Storage + Insights scan costs explode. S3 ($0.025/GB) + Athena (scan $5/TB) standard. Hybrid also possible: add CloudWatch for specific patterns needing real-time (REJECT surge) to S3 baseline.

---

**문제 3.** Detect Lambda ERROR logs real-time, send Slack alert to operators. Most efficient structure?

A) Poll Logs Insights every minute
B) Subscription Filter ("ERROR" pattern) → Lambda → Slack webhook (seconds latency)
C) Metric Filter + Alarm → SNS → Slack (minute latency, threshold-based)
D) Both B and C valid — choose by latency requirement and trigger method

**정답: D**
해설: Subscription Filter: seconds latency, real-time text match. Metric Filter: metric → alarm → SNS, minute latency but threshold-based (e.g., "10+ errors in 5min") reduces noise. Both standard; exam: "immediate response" → Subscription, "threshold-based" → Metric Filter + Alarm. Many companies use both simultaneously.

---

**문제 4.** Logs Insights query with 1-week time range incurs cost/speed penalty. Operator standard response?

A) Add more fields to query
B) Move `filter` early, start narrow time range (1hr → 6hr → 24hr stepping expansion)
C) Replace Insights with manual console search
D) Export to S3 then Athena

**정답: B**
해설: Logs Insights charged by GB scanned. Narrower time range + early filter minimize scanned volume. Stepping expansion standard. D also valid for bulk analysis but B addresses immediate cost problem first.

---

**문제 5.** Detect "Out of Memory" in EC2 syslog, auto-restart instance. Most direct structure?

A) CloudWatch Logs Subscription Filter → Lambda → SSM Run Command or EC2 Reboot API
B) Metric Filter → Alarm → SNS → operator manual action
C) Poll Logs Insights every minute → Lambda
D) EventBridge → Step Functions

**정답: A**
해설: Subscription Filter detects "Out of Memory" pattern → Lambda auto-invoked → Lambda calls SSM Run Command (reboot script) or EC2 Reboot API. Immediate auto-remediation pattern. B requires manual intervention, loses immediacy. C is polling inefficiency.

---

**문제 6.** 50-account ERROR logs real-time analyzed in central security account. Most appropriate pattern?

A) Each account exports to S3, central Athena query
B) Each account Log Group Subscription Filter → central account Log Destination (Kinesis Data Streams) → OpenSearch
C) Create IAM Role in 50 accounts, central polls GetLogEvents every minute
D) Replace with CloudTrail

**정답: B**
해설: Real-time requirement → Subscription Filter + Cross-Account Kinesis. Create Log Destination in central account, central Destination Policy allows source account `logs:PutSubscriptionFilter`. Central OpenSearch Kibana unified search. CloudWatch Cross-Account Observability (2022) achieves same result more simply, alternative answer.

---

**문제 7.** Minimize 7-year-retention audit log costs?

A) CloudWatch Logs 7-year retention
B) Subscription Filter → Firehose → S3 Standard 1yr → S3 Glacier Deep Archive 6yr lifecycle
C) Replace with CloudTrail
D) Lambda daily backup

**정답: B**
해설: CloudWatch Logs Storage ($0.033/GB) vs Glacier Deep Archive ($0.00099/GB) = 33x difference. S3 lifecycle auto-transition, zero operational burden, massive cost reduction. Lifecycle includes auto-expiration after 7 years.

