# Day 1 - CloudWatch: How a Single Metric Becomes an Alarm and Automation

When a problem occurs in a running system, the first question we always ask is the same. "What's wrong right now, and how should we have known?" The entire field of monitoring is actually an attempt to automate these two sentences. AWS CloudWatch is a service that places this automation on top of a single abstraction: "everything ultimately becomes a time-series number (metric)". CPU utilization, Lambda invocation count, error counts extracted from logs, and even custom business metrics — everything inside CloudWatch reduces to the same form of data point: `(timestamp, value, dimensions)`. Understanding why this single abstraction is powerful reveals that metrics, logs, alarms, and dashboards are not separate functions but stages of one pipeline.

In the DVA-C02 exam, CloudWatch is the central axis of the monitoring section. While it does appear as standalone questions, it more frequently shows up in integrated scenarios: "Why isn't EC2 memory a basic metric?", "What must be traversed to create an alarm from a log?", "How to create metrics in Lambda without cost?" This article digs deep into where CloudWatch came from, what the push-based model enables, and how a single metric becomes an alarm and automatic responses like Auto Scaling.

## CloudWatch's Starting Point: From Polling to Push

CloudWatch first appeared in 2009 as an EC2 monitoring tool. At that time, the standard for infrastructure monitoring was **polling-based** tools like Nagios (1999), followed by Zabbix and Munin. In the polling model, a central monitoring server periodically visits each host asking "what's your CPU percentage now?" As the number of hosts grows to thousands, the central server must traverse all of them, and each new instance requires manual registration in the monitoring server configuration. With cloud auto-scaling where instances appear and disappear by the minute, this model was fundamentally misaligned.

CloudWatch instead chose a **push-based** approach. Each resource (or agent) *pushes* its own metrics to CloudWatch. Since the central server doesn't hunt for hosts, horizontal scaling happens naturally regardless of the number of instances, and new instances simply send their metrics on their own. The design of a single entry point, `PutMetricData`, comes from here.

> 💡 **Related theory**: The polling vs. push divide is a long-standing fork in monitoring design. Prometheus (2012, CNCF) interestingly *returned* to polling (scraping) in the cloud era, solving polling's scalability problem by combining it with service discovery (Kubernetes API, etc.) to dynamically determine "what to scrape". This contrast between CloudWatch (push) and Prometheus (pull) doesn't appear directly on the exam but is the philosophical background to the Container Insights vs. Managed Prometheus choice (Day 4). Push means "responsibility on the sender," while pull means "responsibility on the collector" — a difference in authority and trust boundaries.

> 🔍 **Going deeper**: The cost of the push model is that "if a metric isn't sent, CloudWatch doesn't even know it exists". In the polling model, if a host doesn't respond, that itself signals "down". In the push model, silence is ambiguous — is it "normal but quiet" or "dead and unable to send"? The `INSUFFICIENT_DATA` state and missing data handling options (`missing`/`notBreaching`/`breaching`/`ignore`) in CloudWatch alarms exist precisely to force operators to explicitly interpret this ambiguity. "How to treat missing data — as normal or as failure?" is a decision a push-based system must hand over to humans.

## Why EC2 Memory Isn't a Basic Metric: The Hypervisor Boundary

The most common trap in CloudWatch exam questions is "EC2 memory and disk usage are not basic metrics." Understanding *why* rather than merely memorizing this fact ensures you never get it wrong.

The EC2 basic metrics that CloudWatch auto-collects (`CPUUtilization`, `NetworkIn/Out`, `DiskReadOps`, `StatusCheckFailed`, etc.) are all things **observable from outside the hypervisor (Xen/Nitro)**. The hypervisor knows how much CPU time it gave the guest VM, how many network packets passed through the virtual NIC, and how many block I/Os occurred on the EBS volume — these are values the virtualization layer directly mediates, so the hypervisor doesn't need to peer inside the OS. By contrast, **memory utilization** and **disk space usage** are only meaningful inside the guest OS. The hypervisor knows it allocated 4GB RAM to the VM, but to know how much the OS is using as cache versus how much the application occupies, you must read `/proc/meminfo` from inside the OS. AWS peeking into the guest OS internals would violate security and isolation principles.

That's why memory and disk usage were implemented with the **CloudWatch Agent** — software installed in the OS to measure values from inside the OS and push them. "OS-level metrics → Agent required" is a direct consequence of this hypervisor boundary.

> ⚠️ **Trap**: On the exam, `DiskReadOps`/`DiskWriteOps` (block I/O count) are **basic metrics**, while `disk_used_percent` (disk space filled) requires an **Agent**. Both have "disk" in the name and are deliberately written to confuse. The distinction is consistent — I/O count is counted by the hypervisor at the EBS boundary, but "how full is the disk" requires peeking inside the filesystem (OS). "Memory" is similarly always on the Agent side.

> 📚 **Case study**: Before the CloudWatch Agent, AWS provided "CloudWatch Monitoring Scripts" written in Perl (`mon-put-instance-data.pl`), and many operations teams ran this in cron to push memory metrics. In 2017 the unified CloudWatch Agent was released, and this Perl script was effectively deprecated, though it still lingers in older blogs, tutorials, and even some question banks. On the exam, the answer to "EC2 memory monitoring" is always **CloudWatch Agent**, not the Perl script.

## Resolution and Retention: The Trade-off in Time-Series Databases

CloudWatch metrics have two resolutions. The default is **1 minute**, and high-resolution is **1 second**. And EC2 monitoring additionally has Basic (5-minute) and Detailed (1-minute) axes. These numbers are confusing because they refer to different things — resolution is "how often can custom metrics be sent," while Basic/Detailed is "how often does EC2 send automatic metrics."

| Distinction | Value | Remarks |
|------|-----|------|
| Custom metric default resolution | 1 minute | `PutMetricData` default |
| Custom high-resolution | 1 second | `StorageResolution: 1`, additional cost |
| EC2 Basic Monitoring | 5 minutes | Default, free |
| EC2 Detailed Monitoring | 1 minute | Per-instance additional cost |

Retention is also not straightforward. CloudWatch automatically **rolls up** older data — 1-minute data is kept raw for only 15 days, then aggregated to 5-minute for 63 days, then to 1-hour for 15 months total. Sub-60-second high-resolution data lives for only 3 hours.

> 💡 **Related theory**: This strategy of "lower resolution as time passes" is a classic pattern in time-series databases (TSDB) called **downsampling** or **rollup**. RRDtool (1999) is the archetype, storing recent data at high resolution and past data at low resolution in a fixed-size circular buffer. Graphite's Whisper, Prometheus's recording rules, and InfluxDB's retention policies all embody the same idea. The core trade-off is "recent data needs dense resolution for debugging, but data from 6 months ago only needs trend visibility, so there's no reason to store sub-second granularity." Because CloudWatch does this automatically, users don't think about storage costs, but if you try to "look back a month to find a second-long spike from yesterday," it's already been coalesced to 5-minute granularity, creating a trap question.

> 🔍 **Going deeper**: Percentile statistics (`p99`, `p95`, `p50`) matter more than averages in operations for a reason. If API latency averages 200ms but p99 is 3 seconds, then 1 in 100 requests waits 3 seconds — that's the real driver of user churn. Averages dilute extremes and hide the tail, while p99 reveals it. That's why SLOs like "95% of requests under 1 second" are implemented as `p95 < 1000ms` alarms. However, percentiles unlike regular statistics cannot be added or averaged (the average of p99s is not the overall p99), so CloudWatch must preserve the raw distribution to compute them, making the high-resolution + percentile combination more expensive.

## A Metric Becomes Automatic Response: The Alarm State Machine

The real value of CloudWatch is not *showing* metrics but making unattended *responses* when metrics exceed thresholds. At the center is the Alarm — fundamentally a **state machine** oscillating between three states.

```python
cloudwatch.put_metric_alarm(
    AlarmName='HighCPU',
    MetricName='CPUUtilization',
    Namespace='AWS/EC2',
    Period=300,            # Evaluate every 5 minutes
    EvaluationPeriods=2,   # If 2 consecutive data points
    Threshold=80.0,        # exceed 80%,
    ComparisonOperator='GreaterThanThreshold',
    AlarmActions=['arn:aws:sns:...'],  # publish to SNS on ALARM entry
    Dimensions=[{'Name': 'InstanceId', 'Value': 'i-1234567890'}]
)
```

An alarm has three states: `OK` (normal), `ALARM` (threshold violated), `INSUFFICIENT_DATA` (cannot evaluate). Here `EvaluationPeriods=2` is critical — hitting 80% once doesn't trigger the alarm; **2 consecutive periods** must violate the threshold for the state to transition. This debouncing prevents over-reaction to transient spikes. More precisely, "M of N" evaluation (`DatapointsToAlarm`) allows conditions like "3 of the last 5 violated."

Actions fire when the alarm *enters* the `ALARM` state (at the state transition point). Actions include SNS publishing, triggering Auto Scaling policies, stopping/restarting/recovering EC2 instances, creating Systems Manager tasks, etc. A common misunderstanding here is "the alarm directly does Auto Scaling," but precisely it's the alarm *triggers* an Auto Scaling **policy** and that policy adjusts capacity.

> ⚠️ **Trap**: "Auto-scale out when CPU exceeds 80%" — the correct answer is "CloudWatch Alarm → Auto Scaling Policy connection." Choices to connect directly via EventBridge or implement directly with Lambda are marked wrong — technically possible but not the AWS-intended standard path. The exam asks for "the most appropriate way."

> 🔍 **Going deeper**: **Composite Alarms** bundle single alarms together to prevent "alarm storms." When a single database failure triggers 50 dependent service alarms simultaneously, operators must find the real root cause buried in 50 notifications. Composite alarms apply AND/OR logic like "if DB alarm is in ALARM, suppress downstream service alarms" to ensure only the root cause reaches operators. This is SRE's correlation-based alert suppression pattern built into CloudWatch.

## Logs Also Become Metrics: Metric Filter and EMF

CloudWatch Logs stores unstructured text in a hierarchy of log groups (retention unit) → log streams (resource flow) → log events (individual lines). Yet within CloudWatch's unified philosophy, logs are not a destination but *raw material for metrics*. Logs convert to metrics in two pathways.

First, **Metric Filter** detects patterns (like `ERROR`) in log text and turns occurrence counts into metrics. Attach an alarm to that derived metric and you get "notify if ERROR appears over 5 times per minute." The pipeline: logs → pattern matching → metric → alarm.

Second, **EMF (Embedded Metric Format)** reverses direction. Applications output logs in a promised JSON structure, and CloudWatch parses that JSON to *automatically extract metrics*. No need to call `PutMetricData` separately.

```python
import json
print(json.dumps({
    "_aws": {
        "Timestamp": 1721000000000,
        "CloudWatchMetrics": [{
            "Namespace": "MyApp",
            "Dimensions": [["Environment"]],
            "Metrics": [{"Name": "OrderCount", "Unit": "Count"}]
        }]
    },
    "Environment": "prod",
    "OrderCount": 5
}))
```

> 💡 **Related theory**: EMF is especially critical in Lambda because of Lambda's execution model. `PutMetricData` is a synchronous API call; calling it inside a Lambda handler extends function execution by that network round-trip time, and in Lambda where you pay by execution time, that's cost. EMF just prints one line of JSON to `stdout` — logs are sent to CloudWatch asynchronously anyway, so there's no added latency, and metric extraction happens on CloudWatch's side. "Replace a synchronous API call with asynchronous log output to remove it from the hot path" is a common optimization pattern in distributed systems, and the AWS Lambda Powertools library handles this EMF output automatically.

> 📚 **Case study**: **Subscription Filter**, which routes logs to external systems, is the standard entry point for real-time log pipelines. Many organizations use CloudWatch Logs as a first-stage collector but split via Subscription Filter to OpenSearch (search and dashboard) or Kinesis Data Firehose, then fan out to S3 (long-term storage), Splunk, or Datadog. If CloudWatch Logs Insights excels at quick searches of recent logs in its own query syntax, long-term archive analysis is more cost-efficient with S3 + Athena (standard SQL), dividing roles between the two is the production pattern.

## Wrapping Up

The single sentence running through CloudWatch is: "All signals ultimately reduce to time-series metrics, and those metrics pass through alarms to become automatic responses." Push-based design aligned with cloud's dynamic scaling, and in exchange, operators must interpret "silence's ambiguity" (`INSUFFICIENT_DATA`). EC2 memory isn't a basic metric because of the hypervisor boundary; resolution and retention's stepped rollup is a universal TSDB trade-off. Logs even become metrics through Metric Filter and EMF, joining the same alarm pipeline — this integration is CloudWatch's essence, and most exam traps ask about a specific detail somewhere on this pipeline.

In the next article we move beyond metrics that tell us "what's slow" but not "where," tracing an entire request path through microservices with X-Ray.

---

## 📝 연습 문제

**문제 1.** To monitor EC2 instance memory usage in CloudWatch, what's the most appropriate approach?

A) Already included in EC2 basic metrics, no additional action required

B) Install CloudWatch Agent on the instance to push OS-level metrics from inside the system

C) Enable Detailed Monitoring

D) Enable CloudTrail to collect memory events

**정답: B**

해설: Memory usage is a value measurable only inside the guest OS, which the hypervisor cannot observe; therefore, it's not in EC2 basic metrics. **CloudWatch Agent** must be installed on the OS to read internal information like `/proc/meminfo` and push it. A) Basic metrics (CPU, network, DiskOps) are all observed from the hypervisor boundary only. C) Detailed Monitoring makes EC2 *basic* metrics send more frequently (5-minute to 1-minute intervals) but doesn't add a *new* metric like memory — this is the key trap. D) CloudTrail is for API auditing, unrelated to performance metrics.

---

**문제 2.** Which of EC2's `DiskReadOps` vs. `disk_used_percent` is auto-collected as a basic metric, and why?

A) Both are basic metrics

B) `DiskReadOps` is basic (observable at EBS boundary), `disk_used_percent` requires Agent (measured inside filesystem)

C) `disk_used_percent` is basic; `DiskReadOps` requires Agent

D) Both require Agent

**정답: B**

해설: `DiskReadOps` (block I/O count) is observable by the hypervisor at the EBS volume boundary, so it's a basic metric. By contrast, `disk_used_percent` (how full the disk is) requires reading filesystem metadata, so it needs the guest OS's **CloudWatch Agent**. Both words contain "disk," deliberately written to confuse, but the criterion is consistent: "observable from outside the hypervisor vs. must peer inside the OS." Memory follows the same logic and always requires Agent.

---

**문제 3.** Setting `EvaluationPeriods=3`, `Period=60` in a CloudWatch alarm aims to:

A) Send the alarm 3 times per minute

B) Require 3 consecutive 60-second data points to breach the threshold to transition to ALARM — prevents over-reaction to transient spikes

C) Activate the alarm for only 3 minutes

D) Send simultaneously to 3 SNS topics

**정답: B**

해설: `Period` is the data point length (60 seconds), `EvaluationPeriods` is the count of consecutive violations needed for state transition (3). So 3 minutes of continuous threshold breach triggers `ALARM`, debouncing the alarm against momentary spikes. More precise control uses `DatapointsToAlarm` for "M of N" conditions. A, C, and D misinterpret the alarm evaluation mechanism.

---

**문제 4.** To send business metrics (order count, etc.) from a Lambda function to CloudWatch while minimizing execution cost and latency, the best approach is:

A) Synchronously call `PutMetricData` inside the handler

B) Output promised JSON to stdout as EMF (Embedded Metric Format)

C) Run CloudWatch Agent on each invocation

D) Use X-Ray Annotations as substitute

**정답: B**

해설: `PutMetricData` is a synchronous network call; that round-trip extends Lambda execution and increases cost (since Lambda charges by execution time). **EMF** just prints one line of JSON to stdout (logs are sent asynchronously anyway), so metric extraction happens on CloudWatch's side with no added latency in the hot path. AWS Lambda Powertools handles this automatically. C) Agent is for EC2/on-premises, not Lambda. D) Annotations are tracing data, not metrics.

---

**문제 5.** The most common cause of a CloudWatch alarm in `INSUFFICIENT_DATA` state is:

A) The threshold was exceeded

B) Metric data hasn't arrived, so it cannot be evaluated

C) The alarm is normal

D) SNS subscription not confirmed

**정답: B**

해설: In the push model, if metric data isn't transmitted, CloudWatch has no data to evaluate, so it goes to `INSUFFICIENT_DATA`. This reflects the fundamental ambiguity of the push model — "is it quiet/normal or dead/unable to send?" That's why alarms have missing data handling options (`missing`/`notBreaching`/`breaching`/`ignore`) to force operators to explicitly interpret. A) Breach is `ALARM` state, C) Normal is `OK` state.

---

**문제 6.** To send an alarm when `ERROR` occurrence count in accumulated text logs exceeds a threshold, the correct pathway is:

A) CloudTrail directly detects ERROR events

B) Logs Metric Filter transforms ERROR pattern into a metric, then attach an alarm to that metric

C) X-Ray traces ERROR logs

D) Attach alarm directly to Logs Insights query

**정답: B**

해설: In CloudWatch, logs are raw material for metrics. **Metric Filter** detects the `ERROR` pattern in log text, converts occurrence count to a metric, and then an alarm is set on that metric (logs → pattern matching → metric → alarm). A) CloudTrail is for AWS API auditing, not application log pattern detection. C) X-Ray is distributed tracing. D) Logs Insights is an analytics query tool; there's no standard mechanism to attach alarms directly to its query results.

---

**문제 7.** To prevent "alarm storms" where a single database failure triggers dozens of dependent service alarms simultaneously, and notify only the root cause, the appropriate feature is:

A) Raise each alarm's threshold

B) Composite Alarm — combine alarms with AND/OR logic to suppress downstream alarms when upstream root cause is ALARM

C) Disable all alarm SNS actions

D) Enable Detailed Monitoring

**정답: B**

해설: **Composite Alarms** combine multiple alarms with logical conditions to implement correlation-based alert suppression — "if DB alarm is ALARM, suppress child service alarms" — so only the root cause reaches operators instead of 50 child notifications burying it. A) Threshold adjustment doesn't stop the storm itself. C) Disabling all will miss real failures. D) Detailed Monitoring is collection frequency, unrelated to alert suppression.
