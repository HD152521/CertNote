# Day 1 - CloudWatch: Why Observability Split Into the Three Pillars of Metrics, Logs, and Traces

The most expensive moment in any system you operate is "there's an outage and I don't know why." The server didn't die — responses just got slow — but if you can't tell whether it's the DB, the network, or the application code, engineers keep restarting on guesswork while revenue bleeds out. This is exactly why the concept of Observability emerged as distinct from plain "monitoring." Monitoring is "answering questions I defined in advance (did CPU cross 80%?)," while observability is "the ability to answer, with data, even questions I never anticipated (why is only this one specific user slow?)." And that ability only appears when you can cross-reference three kinds of data: metrics, logs, and traces.

**CloudWatch**, which AWS launched in 2009, started as a simple metrics tool that graphed EC2 CPU utilization. But as the cloud fragmented from a single server into hundreds of microservices, Lambdas, and containers, CloudWatch kept expanding too: Metrics (2009) → Logs (2014) → richer Alarms → Logs Insights (2018) → Container/Lambda Insights → Synthetics and RUM. Rather than list CloudWatch's features, this article traces "why metrics and logs had to have different storage structures," "why high-resolution metrics are expensive," and "what distributed-systems problem a Subscription Filter solves" — pinning down the essence of what the SAA exam's Operational Excellence domain is really asking.

## Why You Should Never Put Metrics and Logs in the Same Store

When you first learn CloudWatch, a question arises: "Why are metrics and logs separate? Aren't both just data accumulating over time?" In reality the two are fundamentally different data models, and that difference splits cost, query performance, and retention strategy all at once.

A metric is a **time-series number**. When you attach a dimension like `InstanceId=i-123` to the `CPUUtilization` metric in the `AWS/EC2` namespace, that is "one line a specific instance's CPU draws across the time axis." The key property of time-series data is that **pre-aggregation is possible**. CloudWatch doesn't store incoming raw datapoints as-is; it pre-computes and compresses min/max/sum/avg/count in 1-minute, 5-minute, and 1-hour buckets. That's why querying CPU trends from six months ago is fast and cheap to store. The trade-off is that "what exactly happened in this precise 1 second" is unknowable — it was already aggregated away.

A log is an **unstructured (or semi-structured) text event**. The single line "2026-05-29T10:23:01 ERROR user_id=4823 payment failed: gateway timeout" cannot be aggregated. Each line carries unique context, so none can be discarded, and thus logs are stored raw. Storage costs far more than metrics, and querying requires scanning the whole thing (which is why Logs Insights exists). In exchange, it can answer "what exactly happened in that 1 second."

> 💡 **Related theory**: This split is the architectural difference between a time-series database (TSDB) and a log search engine, plain and simple. TSDBs like Prometheus and InfluxDB store a compressed time series per metric-name-plus-label combination and shrink old data via downsampling. Log engines like Elasticsearch and Loki make text searchable via an inverted index or label-based chunks. CloudWatch put both engines inside one console, but the internal storage structures are completely different — which is why even the APIs are split: PutMetricData for metrics, PutLogEvents for logs.

> 🔍 **Going deeper**: CloudWatch metric retention automatically downsamples by resolution — 1-minute-resolution data is kept 15 days, 5-minute for 63 days, and 1-hour for 455 days (15 months). In other words, when you look at data from six months ago, only values automatically rolled up into 1-hour buckets remain. This isn't a bug; it's intentional downsampling. It's plenty for long-term trend analysis, but if you want to see "the per-minute spike from that incident three months ago," you're already too late. So when compliance or post-incident analysis matters, you must separately siphon raw metrics off to S3/Kinesis via Metric Streams.

The exam-favorite trap that EC2 memory and disk utilization aren't in the default metrics also stems from this structure. CPU, network, and disk I/O are observable at the **hypervisor (Nitro/Xen) level** — AWS sees them directly from the virtualization layer. But memory utilization and free disk space are information **inside the guest OS**. The hypervisor only knows it allocated 4GB to the guest; it has no idea whether the OS inside is using 3GB or 1GB. So to obtain memory and disk metrics, you must install the **CloudWatch Agent** inside the guest and have the OS report them directly. This isn't a limitation of AWS — it's an essential constraint created by virtualization's isolation boundary.

> ⚠️ **Pitfall**: The answer to "I want to create an alarm on EC2 memory utilization" is always "install the CloudWatch Agent." It's easy to misdiagnose it as a missing IAM Role or a region problem, but the key is that memory simply doesn't exist in the standard metrics at all. Going further, in container environments you use Container Insights instead of the Agent, and in Lambda you use Lambda Insights — so the responsible party for "observing inside the guest" shifts per environment.

## The Real Reason High-Resolution Metrics and PutMetricData Are Expensive

CloudWatch custom metrics are published via the `PutMetricData` API. Whereas standard metrics are 1-minute resolution, custom metrics can go up to 1-second (high-resolution). But look at the cost structure and high-resolution metrics are far pricier than standard, and a single metric is billed separately for every dimension combination. Why so expensive?

The core is **cardinality explosion**. Metrics are stored one-per-"metric name + dimension combination." Attach four dimensions — `Service`, `Region`, `Endpoint`, `UserId` — to a `RequestLatency` metric and you get 5 services × 3 regions × 20 endpoints × 100,000 users = 30 million individual time series. Each series is stored, aggregated, and billed separately. That's why the anti-pattern of "putting user ID in a dimension" balloons cost astronomically. Dimensions should only ever be low-cardinality (service, region, endpoint); per-user tracking is the domain of logs/traces, not metrics.

> 🔍 **Going deeper**: This cardinality problem is a fundamental limit of every time-series system. The incident a Prometheus operator fears most is a "high cardinality label" — if someone accidentally puts a request ID or timestamp in a label, the series count grows without bound and the TSDB's memory blows up. CloudWatch defends against this with billing — if cardinality explodes, cost explodes, so it's naturally suppressed. Which means "what do I put in a metric dimension" is a cost decision as much as an architectural one.

EMF (Embedded Metric Format) resolves this tension elegantly. Embed a metric inside a single log line using a special JSON structure, and CloudWatch receives that log and automatically extracts the metric. That is, the application doesn't call PutMetricData at all — it just writes one log — and CloudWatch pulls both a metric and a log out of it simultaneously. It's a pattern that reduces PutMetricData API call count and cost in high-volume environments while getting both an "aggregation metric" and a "detailed debugging log" from the same log line. It fits especially well with environments where stdout automatically flows to CloudWatch Logs, like Lambda.

## The Alarm State Machine and the Meaning of INSUFFICIENT_DATA

A CloudWatch Alarm looks like a simple threshold comparison, but it's actually a state machine with three states: OK / ALARM / INSUFFICIENT_DATA. And properly understanding that third state, INSUFFICIENT_DATA, is the fork in the road of alarm design.

An alarm works on the logic "if M of N datapoints cross the threshold during the evaluation period, go to ALARM" (`evaluation-periods` and `datapoints-to-alarm`). But what if there are no datapoints at all? For example, if traffic is 0 so the request metric isn't reported, the alarm becomes neither OK nor ALARM but INSUFFICIENT_DATA. And here a common incident happens — you set "alarm when error rate crosses the threshold," but when the service dies completely and requests themselves drop to 0, the error-rate metric isn't reported, so the alarm never fires. The worst-case scenario: the service is fully down but monitoring is silent.

> ⚠️ **Pitfall**: You must explicitly choose a "missing data" handling policy. CloudWatch treats missing data as one of `notBreaching` (treat as normal), `breaching` (treat as anomalous), `ignore` (keep current state), or `missing` (default, INSUFFICIENT_DATA). Availability alarms should usually set missing to `breaching` so that "traffic stopped" also counts as an outage. Leave it at the default and a dead service slips by silently.

That alarm actions connect not only to SNS but directly to EC2 Auto Recovery, ASG Scaling, and Systems Manager also reveals the design philosophy. An alarm isn't just a tool to notify a human — it's a **trigger for self-healing**. Attach an Auto Recovery action to the EC2 StatusCheckFailed_System metric, and on hardware failure the instance is relocated to healthy hardware with the same ID and same IP, without any human intervention. A Composite Alarm combines multiple alarms with AND/OR to build precise conditions like "only when the DB alarm AND the cache alarm fire together," suppressing alarm storms. Anomaly Detection uses ML to learn a metric's normal band and catches "different from usual" without a fixed threshold — you use it for services whose traffic varies greatly by time of day or day of week, where a fixed threshold is useless.

> 📚 **Case study**: Many organizations create so many alarms they fall into "alarm fatigue." When hundreds of alarms fire a day, engineers start ignoring all of them, and then they miss the one that actually matters. The principle the Google SRE book emphasizes is: "Every alarm must demand immediate human action — otherwise it's not an alarm, it's noise." To realize this in CloudWatch, bundle correlated alarms with Composite Alarms and route the auto-recoverable ones to automation actions instead of SNS, reducing the number of alarms that reach a human's inbox.

## The Distributed-Systems Problem a Subscription Filter Solves

CloudWatch Logs' Subscription Filter shows up on the exam often as "process ERROR logs in real time," but behind it lies an important distributed-systems design principle. When you need to ship logs somewhere in real time, the question is which to choose: "periodically poll to read new logs" or "push the instant a log arrives."

Polling is simple but has two problems. A long poll interval hurts real-timeness; a short one wastes most polls returning "no new logs." Also, the poller must manage a cursor of how far it has read, and if it dies it either misses logs or double-processes them. The Subscription Filter solves this with a **push-based subscription model** — register a filter pattern on a log group, and the moment a matching log event arrives CloudWatch pushes it to a destination (Lambda / Kinesis Data Streams / Firehose). No polling, no cursor management.

That the destinations split into three is also intentional. **Lambda** is for low-latency, low-volume processing that invokes a function immediately per event (like an instant alert on root login). **Kinesis Data Streams** is for high-volume logs where order must be guaranteed and multiple consumers need to read simultaneously. **Firehose** is for buffering logs and batch-loading them into S3/OpenSearch/Redshift. That is, you pick the destination along three axes — "real-timeness vs throughput vs load target" — and on the exam, "multiple consumers processing the same log stream simultaneously" signals Kinesis, while "collect into S3 for analysis" signals Firehose.

> 🔍 **Going deeper**: Cross-account Subscription is used when the account sending logs differs from the one receiving them. In the pattern where a central security account gathers all member accounts' logs in one place, you create a `Destination` on the receiving side's Kinesis and attach a policy allowing the sending accounts. This is the foundation of multi-account log centralization, and the standard design for pulling security logs into a Log Archive account in an Organizations environment.

## Logs Insights, Dashboards, and External Monitoring

CloudWatch Logs Insights queries logs with a SQL-like query language. Instead of full-scanning raw logs every time, it's a schema-on-read approach that parses only the fields you need at query time. With commands like `fields`, `filter`, `stats`, `sort`, and `limit`, you can ad-hoc run "aggregate the last hour's ERROR logs by endpoint." You don't have to build an index in advance, but in exchange you're billed by the volume of data scanned per query, so narrowing the time range directly affects both cost and speed.

CloudWatch Dashboards composite metric and log widgets from multiple regions and accounts onto one screen. Operating a global service, you need "unified cross-region visibility," but since metrics are region-isolated by default, a cross-region, cross-account dashboard ties this together into a single view. Synthetics actively checks site availability from the outside with a headless browser (Canary) — this is active monitoring that "finds the problem ourselves before users actually experience it" — while RUM (Real User Monitoring) conversely passively collects the performance real users experience via JS embedded in real users' browsers. Synthetics is "proactive detection with synthetic traffic," RUM is "post-hoc analysis with real-usage data" — a complementary pair.

> 💡 **Related theory**: The Synthetics-vs-RUM distinction also maps to monitoring theory's "blackbox vs whitebox." Synthetics is blackbox monitoring that knocks on the system from outside like a user (it doesn't know the internals, only sees results), while CloudWatch Agent, Logs, and EMF are whitebox monitoring that reports from inside the system. Google SRE summarizes it as "blackbox tells you 'something is broken right now,' whitebox tells you 'why it's about to break.'" You need both to see symptom and cause together.

## Comparing With Other Clouds and Tools

Relativizing CloudWatch makes its design choices sharper. SaaS APMs like **Datadog and New Relic** bundle metrics, logs, and traces into one integrated platform from the start, so correlation analysis is seamless — but you have to export data outside and cost spikes as volume grows. CloudWatch keeps data inside AWS and integrates with IAM and KMS, but you have to fill the unified-analysis experience with a separate feature like ServiceLens. The **Prometheus + Grafana** open-source stack is strong on metrics and lets you directly control cost, but the operational burden is heavy and logs/traces need a separate stack (Loki, Tempo). AWS, conscious of this trend, released **Amazon Managed Prometheus (AMP)** and **Managed Grafana (AMG)**, and supports standard OpenTelemetry via ADOT — offering a middle ground of "managed convenience without being locked into AWS."

> 🔍 **Going deeper**: The relationship between EventBridge and the old CloudWatch Events is worth knowing too. CloudWatch Events came first, and EventBridge emerged as its superset — they share the same event bus, but EventBridge added features like third-party SaaS events, a schema registry, and multiple event buses. New designs should use EventBridge, and on the exam the answer for "event-driven automatic response" is EventBridge. Remember the division of labor — CloudWatch Alarm → SNS is threshold-based, EventBridge rule → target is event-pattern-based — and you won't get confused.

## Getting Hands-On With the CLI

```bash
# Create an Alarm (CPU > 70%, ALARM if exceeded 2 consecutive 1-min periods)
aws cloudwatch put-metric-alarm --alarm-name HighCPU \
  --metric-name CPUUtilization --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --statistic Average --period 60 --threshold 70 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 --datapoints-to-alarm 2 \
  --treat-missing-data breaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111:ops-topic

# Auto-recover on EC2 system status failure (relocated with same ID/IP)
aws cloudwatch put-metric-alarm --alarm-name AutoRecover \
  --metric-name StatusCheckFailed_System --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --statistic Maximum --period 60 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:automate:ap-northeast-2:ec2:recover

# Publish a custom metric (dimensions must be low-cardinality only)
aws cloudwatch put-metric-data --namespace MyApp \
  --metric-name OrderProcessed \
  --dimensions Service=checkout,Region=apne2 \
  --value 1 --unit Count

# Logs Insights query (narrow the time range to optimize cost and speed)
aws logs start-query --log-group-name /aws/lambda/saa-fn \
  --start-time $(date -d '-1 hour' +%s) --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message
    | filter @message like /ERROR/
    | stats count(*) as errors by bin(5m)
    | sort errors desc'

# Push ERROR logs to Lambda in real time via a Subscription Filter
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/saa-fn \
  --filter-name error-to-lambda \
  --filter-pattern "ERROR" \
  --destination-arn arn:aws:lambda:ap-northeast-2:111:function:alert-fn

# Composite Alarm (only when the DB and cache alarms are both in ALARM)
aws cloudwatch put-composite-alarm \
  --alarm-name DbAndCacheDown \
  --alarm-rule "ALARM(DbAlarm) AND ALARM(CacheAlarm)" \
  --alarm-actions arn:aws:sns:ap-northeast-2:111:critical
```

## Wrapping Up

CloudWatch handles two of observability's three pillars, metrics and logs (traces are X-Ray, Day 4), and it's AWS's standard operations tool that stacks alarms, automation, and external monitoring on top. The essence compresses into five points. ① Metrics are pre-aggregated time series, so they're cheap and fast but lose "that one second," while logs are raw, so they're expensive but preserve exact context — that's why the two storage structures are separate. ② EC2 memory and disk are information inside the guest OS, so the hypervisor can't see them and you need the CloudWatch Agent. ③ Putting a high-cardinality value (user ID) in a metric dimension explodes cost, so use only low-cardinality ones, and leave fine-grained tracking to logs/traces. ④ An Alarm is an OK/ALARM/INSUFFICIENT_DATA state machine, and availability alarms must treat missing data as breaching so they don't miss a dead service. ⑤ A Subscription Filter is a poll-free push subscription, and you choose between Lambda/Kinesis/Firehose by real-timeness, throughput, and load target.

In the next article, we look at the audit tool that answers not "what is happening now" but "who did what" — CloudTrail. If CloudWatch is the tool for seeing a system's health, CloudTrail is the tool that records the actions of people and services in a tamper-proof way, and it's the starting point of security incident analysis.

---

## 📝 연습 문제

**문제 1.** An operations team wants to set an alarm on an EC2 instance's memory utilization but can't find a memory metric in the `AWS/EC2` namespace in the CloudWatch console. Which is the correct cause and solution?

A) The IAM Role lacks the cloudwatch:GetMetricData permission; adding it makes the metric appear
B) Memory and free disk space are information inside the guest OS and aren't in the standard metrics; you must install the CloudWatch Agent
C) The wrong region is selected; switching to the correct region makes it appear
D) It's a high-resolution metric and needs separate enablement

**정답: B**

해설: CPU, network, and disk I/O are observable at the hypervisor (Nitro) level so they exist in the standard metrics, but memory utilization and free disk space are information inside the guest OS. The hypervisor only knows the total it allocated to the guest, not how much the OS is using inside. So you must install the CloudWatch Agent inside the guest and have the OS report directly. A, C, and D all start from the false premise that memory exists in the standard metrics.

---

**문제 2.** A payment service set a CloudWatch Alarm to "alarm when error rate exceeds 5%." One day the service went completely down and requests themselves dropped to 0, but the alarm didn't fire. What is the most appropriate fix?

A) Lower the threshold from 5% to 1%
B) Increase the evaluation period
C) Set missing-data handling to breaching
D) Switch to Anomaly Detection

**정답: C**

해설: When requests are 0, the error-rate metric itself isn't reported, so the alarm becomes INSUFFICIENT_DATA, and under the default handling (missing) it doesn't transition to ALARM. Availability alarms must treat missing data as breaching so that "traffic stopped" also counts as an outage. A and B only adjust sensitivity when data exists and don't solve the no-data problem. D is useful for learning the normal band, but with no data at all it hits the same limit.

---

**문제 3.** A team wants to process all ERROR logs in real time. Multiple consumers (a Lambda for alerts, an analytics app, a security SIEM) must read the same log stream simultaneously and independently, and order must be guaranteed. Which is the most suitable destination for a CloudWatch Logs Subscription Filter?

A) Lambda
B) Kinesis Data Streams
C) Kinesis Data Firehose
D) Direct delivery to S3

**정답: B**

해설: When multiple consumers must read the same stream simultaneously and independently with order guaranteed, Kinesis Data Streams fits (per-shard ordering + multiple consumers). Lambda suits immediate, low-latency, single processing per event; Firehose is for buffering then batch-loading into S3/OpenSearch and is unsuitable for multiple independent consumers. A Subscription Filter cannot deliver directly to S3.

---

**문제 4.** An application publishes a custom metric via PutMetricData, but including `UserId` (100,000 users) in a dimension caused CloudWatch cost to spike. What is the most effective way to reduce cost?

A) Lower the metric resolution from 1 second to 1 minute
B) Remove the UserId dimension and keep only low-cardinality dimensions (Service, Region), moving per-user tracking to logs/traces
C) Batch the PutMetricData calls together
D) Reduce the metric retention period

**정답: B**

해설: CloudWatch metrics are stored and billed as a separate time series per "name + dimension combination." Putting a high-cardinality value like UserId in a dimension explodes the series count and spikes cost. Dimensions should use only low-cardinality values, and fine-grained per-user tracking is the domain of logs (Logs Insights) or traces (X-Ray), not metrics. A and D have limited effect, and C isn't a fundamental fix since billing is by datapoint.

---

**문제 5.** In a Lambda function you want to aggregate metrics at high volume while also leaving detailed debugging logs on the same line, and reduce PutMetricData API call cost. Which technique fits best?

A) Enable high-resolution metrics
B) Embed metrics in logs with EMF (Embedded Metric Format)
C) Composite Alarm
D) Metric Streams

**정답: B**

해설: EMF is the feature where you embed a metric in a single log line with a special JSON structure and CloudWatch automatically extracts the metric from that log. The application doesn't call PutMetricData — it just writes a log — yet gets both the metric and the detailed log at once. It fits especially well with environments where stdout automatically flows to CloudWatch Logs, like Lambda. A actually increases cost, C is an alarm combination, and D is a metric-export feature.

---

**문제 6.** You operate a global service in three regions: us-east-1, ap-northeast-2, and eu-west-1. The SRE team wants to view the three regions' key metrics and ERROR-log trends on one screen. Which is the most suitable solution?

A) Open a separate console per region and compare manually
B) Composite widgets into one view with a cross-region (and cross-account if needed) CloudWatch Dashboard
C) Re-send all metrics to us-east-1 via PutMetricData
D) Use the Service Health Dashboard

**정답: B**

해설: CloudWatch metrics are region-isolated by default, but a cross-region, cross-account Dashboard composites widgets from multiple regions and accounts onto one screen for unified global visibility. A carries a heavy operational burden and is error-prone; C is costly, complex, and creates a data-duplication problem; D is AWS's overall service status page, not your own metric dashboard.

---

**문제 7.** A team wants to actively check the main user flows (login → search → checkout) from the outside every 5 minutes so that "we find the outage before users do." Which is the most suitable tool?

A) CloudWatch RUM
B) CloudWatch Synthetics Canary
C) X-Ray
D) CloudWatch Logs Insights

**정답: B**

해설: A Synthetics Canary is blackbox monitoring that actively checks user flows from the outside with synthetic traffic via a headless browser. It fits the requirement "proactively detect before real users experience it" exactly. RUM, conversely, passively collects real-user performance via JS embedded in real users' browsers. X-Ray is distributed tracing and Logs Insights is log querying — neither is active external checking.

---

Supplementary note: CloudWatch is the center of the SAA operations domain, and the exam repeatedly asks "which data (metric/log/trace) answers which question" and "which automation path (alarm action, Subscription Filter) solves which requirement." Precisely distinguishing these four — the storage-structure difference between metrics and logs, EC2 memory's Agent dependency, an alarm's missing-data handling, and a Subscription Filter's destination choice — solves the majority of CloudWatch questions.
