# Day 5 - Week 3 Review: CloudWatch Observability Stack Synthesis

The CloudWatch tools covered in Week 3 are independent of each other, but in actual operations, they form one observability pipeline. When an Alarm detects "something went wrong," the Dashboard shows "what range and how much," Agent lets you "look inside the guest OS," Synthetics maintains the "user perspective," and X-Ray traces "which service's which call" is the cause. When this pipeline works perfectly together, MTTD/MTTK (Mean Time To Know) from incident detection to root cause analysis shrinks.

Today we re-examine how these five tools actually connect structurally, organize each tool's internal design principles in comparison tables, and solve the 10 most frequent exam scenarios.

## Week 3 Key Concept Connection Map

```
[Synthetics Canary]            [Real Users + RUM]
 24/7 availability                LCP/CLS/JS errors
 detection without traffic         real user data only
       │                              │
       ▼                              ▼
[CloudWatch Alarms]  ←──── [CloudWatch Metrics]  ←──── [CloudWatch Agent]
 M of N evaluation              (Standard + Custom)     EC2 memory/disk
 Composite Alarm                Dashboard display        procstat/StatsD
 Anomaly Detection                   │                   custom namespace
       │                             │
       ▼                             ▼
 [SNS/PagerDuty]            [CloudWatch Dashboard]
 [SSM Automation]            Cross-Account OAM integration
 [Auto Scaling]              Golden Signals design
                                     │
                              [X-Ray + ServiceLens]
                               distributed tracing → Logs jump
                               Service Map → Trace → Log
```

> 💡 **Related Theory**: This pipeline applies **Observability**, a concept from control theory, to modern distributed systems. First formalized by Rudolf Kalman in 1960 in "On the General Theory of Control Systems," it asks: "Can the internal state of a system be completely estimated from external outputs alone?" Metrics (numbers), Logs (text), and Traces (paths) are the "external outputs" in modern operations. CloudWatch integrates three signals into one platform, X-Ray handles Traces, and ServiceLens connects all three on one screen.

## Frequently Confused Key Comparisons

**M of N vs Treat Missing Data**

M of N controls "how long must the violation persist to trigger an alarm?" Treat Missing Data controls "how do we judge when data is absent?" These two settings are often confused.

| Setting | What It Controls | Key Use Case |
|---------|------------------|--------------|
| M of N (EvaluationPeriods + DatapointsToAlarm) | Duration of violation | Ignore temporary spikes |
| Treat Missing Data: breaching | Missing data = violation | Services that must always be alive |
| Treat Missing Data: notBreaching | Missing data = healthy | Idle workloads, terminated instances |
| Treat Missing Data: missing (default) | Ignore gaps, evaluate other data | General cases |
| Treat Missing Data: ignore | Maintain current state | Maintenance windows |

**Synthetics vs RUM vs X-Ray**

| Item | Synthetics | RUM | X-Ray |
|------|-----------|-----|-------|
| Perspective | External bot | Real user browser | Service-to-service internal |
| Traffic Unnecessary | Y (synthetic) | N | N |
| Find Latency Cause | N | Partial (browser layer) | Y (Subsegment-level) |
| Service Map | N | N | Y |
| Cost Model | Per canary execution | RUM event count | Trace count |
| Detect No-traffic Downtime | Y | N | N |

> 💡 **Related Theory**: The distinction between these three tools corresponds to the difference between **external quality** and **internal quality** in software quality measurement theory. Synthetics and RUM measure external quality experienced by users, while X-Ray measures internal structural quality (which component adds which latency). Google SRE's "Golden Signals" (latency, traffic, errors, saturation) is a framework that combines both perspectives: Synthetics measures external latency and errors including availability, while X-Ray measures per-component internal latency and saturation.

**Composite Alarm vs Metric Math Alarm**

| Item | Composite Alarm | Metric Math Alarm |
|------|-----------------|-------------------|
| Input | State of other alarms (OK/ALARM) | Metrics + expressions |
| Expression | `ALARM("a") AND ALARM("b")` | `e/r*100 > 5` |
| Purpose | Reduce alarm noise, service-level aggregation | Alarm on derived metrics like error rate |
| Actions Suppressor | Y (disable child alarm actions) | N |
| Cost | Composite Alarm + each child alarm charged | One alarm charged |

> 💡 **Related Theory**: The Boolean expression design of Composite Alarm has the same structure as logic circuit theory. Just as digital circuit design combines AND/OR/NOT gates to express complex conditions, alarms are combined as logical gates to judge "is the entire service degraded?" This abstraction layer aligns with Jens Rasmussen's (1983) "Skills, Rules, Knowledge" cognitive layering model: abstracting lower signals (child alarms) into higher semantic units (service state).

**CloudWatch Agent Collected Metrics Types**

| Metric | Collection Method | Namespace | Agent Required |
|--------|-------------------|-----------|-----------------|
| CPU Utilization | Hypervisor | AWS/EC2 | No |
| Network In/Out | Hypervisor | AWS/EC2 | No |
| mem_used_percent | /proc/meminfo | CWAgent (custom) | Yes |
| disk_used_percent | statfs() syscall | CWAgent (custom) | Yes |
| Per-process CPU | /proc/[pid]/stat | CWAgent (custom) | Yes (procstat) |
| Application Custom | StatsD UDP 8125 | Custom specified | Yes (StatsD server) |

> 🔍 **Deeper Dive**: The way CloudWatch Agent reads `/proc/meminfo` on Linux differs fundamentally from reading WMI (Windows Management Instrumentation) Performance Counters on Windows. On Linux, procfs is a virtual filesystem through which the kernel exposes memory statistics in real-time. The `mem_used_percent` is calculated by combining `MemTotal`, `MemFree`, `Buffers`, and `Cached` fields. The formula is `(MemTotal - MemFree - Buffers - Cached) / MemTotal × 100`, matching the `used` column of the `free -m` command. On Windows, the `\Memory\% Committed Bytes In Use` counter is used.

**X-Ray Sampling: Reservoir + Fixed Rate Flow**

```
2000 requests per second → Sampling Rule applied
                    │
          Reservoir = 10 (at least 10 per second guaranteed)
                    │
          ┌─────────┴─────────┐
     First 10 requests       Remaining 1990
     (100% sampling)          Fixed Rate = 5% applied
                               = approximately 99 additional samples
                    │
          Approximately 109 traces sent per second
```

> 💡 **Related Theory**: X-Ray's Reservoir + Fixed Rate design is structurally identical to the **Token Bucket** algorithm in network traffic control. Reservoir is the bucket size (burst capacity), and Fixed Rate is the sustained processing rate. RFC 2697 (srTCM, Single Rate Three Color Marker) and RFC 2698 (trTCM) standardize this pattern. During low-traffic periods (early morning), the Reservoir alone is sufficient for sampling, while during high-traffic periods (lunch time), Fixed Rate controls costs with automatic adjustment.

## Production Operations Anti-Patterns Summary

Anti-patterns of each tool learned in Week 3 compiled at once.

**Alarm Anti-Patterns**
- All alarms DatapointsToAlarm=1 → PagerDuty flooded by every spike
- Treat Missing Data default (missing) + critical service → instance dies but alarm doesn't fire
- Each child alarm with PagerDuty action → dozens of notifications per incident
- Direct alarm on cross-region metrics → doesn't work (only same-region evaluation possible)
- Trust Anomaly Detection on service launch day → band unstable during 2-week learning period

**Dashboard Anti-Patterns**
- Public Sharing for external sharing → instance IDs, traffic patterns, error messages exposed without auth
- 50 widgets on one dashboard → Dashboard Fatigue (more widgets don't mean higher observability)
- Number widgets without units → meaningless numbers ("is 1247 good or bad?")
- No hierarchy, all equal importance → don't know where to look during incidents

**Agent Anti-Patterns**
- Install Agent without IAM Role → PutMetricData AccessDenied (Agent can't call CloudWatch API)
- Deploy with User Data only, no State Manager → configuration drift undefended
- retention_in_days unset → Log Group kept forever, costs increase (Never Expire)
- Search for memory in AWS/EC2 without verifying Custom Namespace → not there, can't create alarm

**X-Ray Anti-Patterns**
- 100% sampling → costs explode in high-traffic service (100M RPS × $5/1M Traces = $500/day)
- DynamoDB call without SDK captureAWS() → Subsegment not visible, no DynamoDB node in Service Map
- Sampling Rule priority unset → important payment API and health check get same sampling rate
- Fault vs Error confused → Fault (5xx, possibly AWS responsibility) vs Error (4xx, client issue) distinction important for root cause analysis

> 📚 **Case Study**: In 2023, a major e-commerce company A (public case) left X-Ray 100% sampling on during Black Friday prep and received an unexpected $8,000 X-Ray bill for one day. After switching to fixed Reservoir + low Fixed Rate (1%) during traffic surge periods, cost dropped to $40/day while maintaining 100% error tracing via separate Priority 1 Rule. Sampling Rule design is a high-ROI optimization point.

> ⚠️ **Pitfall**: ServiceLens is a view integrating CloudWatch, X-Ray, and Synthetics Canary data, but all three services must be operating normally. If Lambda Active Tracing is disabled, Lambda won't appear in ServiceLens Service Map. If X-Ray SDK doesn't wrap AWS SDK, downstream services like DynamoDB and SQS disappear from the Map. If ServiceLens screen looks empty, first check X-Ray SDK configuration and Active Tracing status.

## Comparison with Other Cloud Platforms

| Feature | AWS CloudWatch | GCP Cloud Operations | Azure Monitor |
|---------|----------------|--------------------|---------------|
| Metrics | CloudWatch Metrics | Cloud Monitoring | Azure Monitor Metrics |
| Logs | CloudWatch Logs | Cloud Logging | Log Analytics |
| Traces | X-Ray | Cloud Trace | Application Insights |
| Agent | CloudWatch Agent | Ops Agent | Azure Monitor Agent |
| Synthetic Monitoring | Synthetics Canary | Uptime Checks | Application Insights Availability |
| Anomaly Detection | Anomaly Detection | Alerting Policy ML | Dynamic Threshold |
| Cross-Account | OAM Sink+Link | Workspace-based | Resource scope |
| Dashboard | CloudWatch Dashboard | Cloud Monitoring Dashboard | Azure Dashboard |

> 🔍 **Deeper Dive**: GCP's Ops Agent is structurally similar to CloudWatch Agent but uses OpenTelemetry Collector as its internal pipeline. CloudWatch Agent operates as its own Go binary. Azure Monitor Agent differs by defining collection policies centrally via DCR (Data Collection Rules). CloudWatch Agent corresponds by centralizing configuration via SSM Parameter Store. All three platforms clearly distinguish between metrics collectible without an agent (hypervisor layer) and metrics requiring an agent (OS layer).

## Incident Response Flow: Tool Connection Order

When actual incidents occur, the order in which to use CloudWatch tools is organized by scenario.

**Scenario: API Response Time Spike**

```
1. Composite Alarm triggers (ALB Latency High AND EC2 CPU High)
   → PagerDuty alert
2. View overall scope in CloudWatch Dashboard
   - ALB RequestCount, TargetResponseTime
   - EC2 CPUUtilization (Agent custom: mem_used_percent, disk_used_percent)
3. Check Service Map in X-Ray ServiceLens
   - Which service (Lambda, DynamoDB, RDS) has latency?
4. Error service Trace details → identify bottleneck at Subsegment level
5. ServiceLens "View Logs" → immediately see relevant execution logs in CloudWatch Logs
6. Synthetics Canary results → check user endpoint availability status
```

> 💡 **Related Theory**: This response order is a "Breadth-First Search → Depth-First" strategy. Start wide (dashboard, entire service map), then narrow scope (specific service Trace) and dig deep (Subsegment, logs). This is the core of "structured troubleshooting" recommended by Google SRE: from symptom to cause, from broad hypotheses to narrow ones.

---

## 📝 Practice Questions

**Question 1.** An EC2 instance was forcibly terminated by OOM. The memory alarm has Treat Missing Data = missing and EvaluationPeriods=5. Currently 2 data points are missing. What is the alarm state?

A) ALARM — because the instance was terminated by OOM and the metric stopped, it transitions to ALARM automatically regardless of the missing setting
B) INSUFFICIENT_DATA — not enough data is missing, so it cannot be determined
C) OK — Treat Missing Data = missing treats the missing interval as normal and keeps the last state as OK
D) DISABLED — when the data source disappears, CloudWatch automatically disables the alarm

**Answer: B**
Explanation: Treat Missing Data = missing ignores the missing data points and evaluates with the remaining data points (3). If the last 3 points were normal, the alarm stays in the OK or INSUFFICIENT_DATA state. The assumption "the instance died, so it automatically goes to ALARM" is wrong. For servers where availability is critical, you must set Treat Missing Data = breaching so that the alarm transitions to ALARM when the instance disappears.

---

**Question 2.** In one incident, the operations team had 20 alarms for EC2/RDS/ALB/ElastiCache fire at the same time, so PagerDuty paged 20 times. What is the most structural way to solve this?

A) Raise the thresholds of all 20 alarms to lower the chance of simultaneous firing and reduce the number of alarms that fire at once
B) Increase EvaluationPeriods and DatapointsToAlarm on all 20 alarms to suppress multiple firings caused by a temporary simultaneous spike
C) Apply an Actions Suppressor to the 20 child alarms + combine them logically with a Composite Alarm → only the parent pages PagerDuty
D) Group highly correlated alarms to consolidate 20 into 10, and expose the rest only on a dashboard instead of through SNS

**Answer: C**
Explanation: This is the core use case for a Composite Alarm. The 20 child alarms each track their metric but have their actions disabled. When the Composite Alarm judges the "real service degradation" state with a logical combination such as "ALB 5xx AND (EC2 CPU OR RDS CPU)," only that one is connected to PagerDuty. Raising thresholds or increasing EvaluationPeriods creates a different problem, since detection itself becomes slower.

---

**Question 3.** You created an alarm for 90% EC2 memory utilization, but you cannot find that metric in CloudWatch. What is the cause and the fix?

A) Enabling Detailed Monitoring reduces the collection interval to 1 minute and adds the memory metric to AWS/EC2
B) Memory is not among the EC2 default metrics. Install the CloudWatch Agent + configure the mem plugin + create the alarm in the custom namespace
C) Memory is published not in AWS/EC2 but in a separate system namespace such as AWS/EC2/MemoryUtilization, so look for it there
D) The metric is published in us-east-1 rather than the instance's home Region, so switch the console Region to us-east-1 and search

**Answer: B**
Explanation: EC2 memory is information inside the guest OS that the hypervisor cannot see. If you install the CloudWatch Agent and add a `mem` section to the configuration file, the `mem_used_percent` metric is published to the `CWAgent` namespace (or the custom namespace you configured). When creating the alarm, you must select that namespace rather than `AWS/EC2`.

---

**Question 4.** A company operates 5 AWS accounts. It wants to see EC2 CPU for all accounts on a single dashboard. What is the correct configuration?

A) The dashboard in the Organizations management account automatically inherits member account metrics, so CPU for all accounts is visible with no additional setup
B) CloudWatch Cross-Account Observability: create an OAM Sink in the Monitoring Account + create a Link in each account → specify accountId in the dashboard widgets
C) Deploy the same dashboard to the 5 accounts with a CloudFormation StackSet, and view each account's own EC2 CPU in its own console
D) Copy CPU metric change events to the central account bus with an EventBridge rule in each account, then republish with PutMetricData to consolidate

**Answer: B**
Explanation: The OAM (Observability Access Manager) Sink + Link structure is the standard for CloudWatch Cross-Account Observability. Create a Sink in the Monitoring Account and use the Sink policy to control which accounts can create a Link. When a Link is created in each Source Account, the other accounts' metrics become visible in the Monitoring Account console. You must specify `accountId` and `region` in the metric definitions of the dashboard widgets.

---

**Question 5.** The API went down at 2 AM, but because there was no traffic, RUM had no data and no alarm fired. What is the most appropriate tool to prevent this problem?

A) Reduce the CloudWatch Agent collection interval to 1-second resolution to capture the early-morning downtime more finely
B) Add the RUM snippet to all pages and raise the session sampling rate to 100% to collect all traffic, including early morning
C) Set up a Heartbeat Canary with a 1-minute schedule using Synthetics Canary
D) Raise the X-Ray sampling rate to 100% to trace all requests, including early-morning hours, and detect the outage

**Answer: C**
Explanation: RUM has no data in the early morning when there are no real users. A Synthetics Canary has synthetic users (bots) call the API on a set schedule, so it measures 24/7 availability regardless of traffic. On failure the `SuccessPercent` metric drops, and the alarm notifies immediately via SNS. The X-Ray sampling rate is about cost and tracing precision and is unrelated to availability detection.

---

**Question 6.** You newly enabled an Anomaly Detection alarm, but it has not fired even once in 2 weeks. Is this normal or a problem?

A) It is a permissions issue. If the alarm role lacks `cloudwatch:GetMetricData` and `PutAnomalyDetector` permissions, band evaluation fails silently
B) It is normal. The service has been running stably for 2 weeks. Anomaly Detection bands stabilize after a minimum of 2 weeks of learning
C) The `ANOMALY_DETECTION_BAND` expression is not connected to the alarm condition, so the model learns but the alarm cannot evaluate the metric
D) The source metric was missing during the learning period, so the alarm stays in INSUFFICIENT_DATA and never fires

**Answer: B**
Explanation: The Anomaly Detection ML model learns from a minimum of 2 weeks of data. During the learning period, it is normal for the band to be unstable or set wide so that no violations are detected. After 2 weeks, a more accurate band that reflects weekly seasonality (Monday-to-Friday pattern) forms. If the alarm did not fire for 2 weeks, the service is most likely operating normally.

---

**Question 7.** You want to trace the latency of a DynamoDB query inside a Lambda function with X-Ray. What are the two required actions?

A) Enable Active Tracing on the Lambda function + wrap the AWS SDK with the X-Ray SDK's captureAWS()
B) Just enable Active Tracing on the Lambda function, and the runtime automatically instruments all AWS SDK calls so even the DynamoDB Subsegment appears
C) Install the CloudWatch Agent in the Lambda execution environment and run the X-Ray Daemon as a sidecar to collect DynamoDB call latency
D) Receive DynamoDB API events with EventBridge and join them with CloudTrail Data Events to reconstruct query latency

**Answer: A**
Explanation: Lambda Active Tracing traces the Lambda execution itself as a Segment. To trace DynamoDB calls inside Lambda as Subsegments, you must additionally use the X-Ray SDK to wrap the AWS SDK with `const AWS = AWSXRay.captureAWS(require('aws-sdk'))`. Without this wrapping, DynamoDB calls do not appear in the X-Ray Service Map. B is insufficient because Active Tracing alone does not automatically instrument SDK calls; for C, the X-Ray Daemon is managed by AWS in Lambda and cannot be installed separately; D is an audit log, not tracing, so it cannot provide Subsegment latency.

---

**Question 8.** You deployed the CloudWatch Agent to 100 EC2 instances, but on some instances the Agent configuration was reset (overwritten with a different configuration). How do you prevent this?

A) Restart all instances with the broken configuration and reapply the Agent configuration through User Data bootstrapping
B) Periodically enforce the desired configuration with an SSM State Manager Association (desired state enforcement)
C) Redeploy the instances immutably with CloudFormation to reset the changed configuration based on a new AMI
D) Use an IAM policy to Deny writes to the Agent configuration file (`amazon-cloudwatch-agent.json`) on the EC2 instance, blocking modification at the source

**Answer: B**
Explanation: The core feature of SSM State Manager is "automatic drift correction." If you set the Association to rate(24 hours), it reconfigures the Agent from the configuration in SSM Parameter Store every 24 hours. Even if someone changes the configuration, it is automatically restored to the original on the next Association run. Blocking file modification with an IAM policy is difficult at the process level inside EC2.

---

**Question 9.** What is the biggest practical benefit of using ServiceLens?

A) It combines Traces and Logs into a single view and removes duplicate storage, so X-Ray and Logs retention costs are reduced automatically
B) When you select an error Trace in the X-Ray Service Map, you can jump immediately to the CloudWatch Logs of that Lambda/ECS
C) It analyzes Service Map traffic patterns and automatically optimizes the Reservoir and Fixed Rate of X-Ray Sampling Rules
D) Synthetic traffic results from Synthetics Canary are automatically merged into Service Map nodes, showing even external availability on one screen

**Answer: B**
Explanation: The core value of ServiceLens is "correlated telemetry." When you click "View logs" from a Trace ID with an error, the logs for that execution open immediately in the CloudWatch Logs of that Lambda function. It skips the process of manually searching the Log Group for the request_id, greatly reducing incident analysis time (MTTD).

---

**Question 10.** X-Ray cost has spiked. An API with traffic of 2000 RPS currently uses the default sampling (Reservoir=1, Fixed Rate=5%). How can you reduce cost while ensuring that requests are always traced when errors occur?

A) Disable X-Ray everywhere and analyze errors after the fact only through ERROR logs in CloudWatch Logs
B) Lower the Fixed Rate of the default Sampling Rule to 1%, and handle requests with errors/Faults first through a separate Rule (Priority 1, FixedRate 1.0)
C) Turn off X-Ray tracing and replace all request paths with EMF structured logs + Logs Insights, bringing Trace cost to 0
D) Move the workload to a Region with a lower X-Ray unit price, keeping the same 100% sampling while only lowering the bill

**Answer: B**
Explanation: If you filter requests by error/Fault conditions in an X-Ray Sampling Rule, you can lower the sampling rate for normal traffic while tracing errors at 100%. In an Advanced Sampling Rule, adding `errorCode` and `faultCode` conditions lets you apply a Fixed Rate of 1.0 to HTTP 5xx responses. Normal traffic at 1% + errors at 100% is the standard pattern that secures both cost savings and precision.

---

## Week 4 Preview — Logging and Audit Essentials: CloudTrail + Config

Week 4 is the week of audit tools that track "who did what" and "does the current state comply with regulations?"

- Day 1: CloudTrail — difference between Management Event and Data Event, Organization Trail, log integrity validation
- Day 2: CloudTrail Lake — SQL-based analytics data lake, Insights anomaly detection, EventBridge real-time response
- Day 3: AWS Config — Rule evaluation triggers, Conformance Pack, Auto Remediation SSM integration
- Day 4: Audit Manager, License Manager, Resource Explorer — audit report automation and resource visibility
- Day 5: Week 4 review 10 scenario questions

If CloudWatch showed "what's happening right now," CloudTrail + Config tracks "what happened, who did it, and whether we're compliant." Both domains carry high exam weight in SOA-C02.
