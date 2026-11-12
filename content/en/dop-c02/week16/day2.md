# Day 2 - Domain 3+4 Integrated: Resilience and Observability as Failure Prevention

Today: **resilience (22%) and monitoring (14%)**, together 36% of the exam. Again, split in the blueprint but woven in practice. Resilience without observability is blind — you rebuild the same failure. Observability without resilience is watching burndown without circuit breakers. Today, link them as "observability detects failure, resilience contains blast radius, feedback loop prevents recurrence."

## RTO/RPO Math — Defining Failure's Business Impact

Resilience starts with business language, not engineering.

> 💡 **Related theory**: RTO (Recovery Time Objective) and RPO (Recovery Point Objective) are **legal/business contracts**, not technical specs. RTO = "how long can you be down?" RPO = "how much data loss is acceptable?" From these, architecture **must follow.** RTO 1min, RPO 1sec → multi-region active-active + continuous replication. RTO 4h, RPO 1h → single-region with hourly backup. RTO/RPO define **Tier** (Tier-1 critical vs Tier-3 non-critical), which drives cost·complexity.

| Use Case | RTO | RPO | Architecture | Cost |
|---|---|---|---|---|
| Banking core | 1min | 0 sec (sync replication) | Multi-region active-active, Aurora Global, DynamoDB Global Tables | $$$ |
| SaaS web app | 1h | 15min | Standby region (cross-region read replica), hourly snapshot | $$ |
| Data warehouse | 8h | 1h | Single-region snapshot, restore as needed | $ |
| Development | 24h | 1h | Local backup to S3 | $ |

> 🔍 **Deeper**: **RTO and RPO are asymmetric.** "RTO 1min, RPO 24h" means: failover fast but tolerate 1 day of data loss (e.g., cold analytics). DynamoDB Global Tables: RTO ~sec (instant failover), RPO ~1sec (nearly sync). Aurora Global Database: RTO ~1sec (Failover API), RPO depends on replication lag (~100ms typical, but not zero). Exam: "what RTO/RPO" → read scenario, map to architecture.

> 📚 **Case study**: 2017 **GitHub DDoS + DNS hiccup**, took 25 min to fail over to backup region, not because technology failed but because "what is our RTO?" was never documented. Result: regulatory fine + SLA breach. Lesson: define RTO/RPO first, then pick architecture.

## Disaster Recovery Strategies — Four Models

AWS defines four patterns; each trades cost vs speed.

| Strategy | Description | Failover speed | Data loss | Cost | AWS service fit |
|---|---|---|---|---|---|
| **Backup & Restore** | Backup snapshot to S3, restore on demand | Hours | Up to RPO interval | Lowest | S3 + AMI + RDS Backup |
| **Pilot Light** | Minimal replica running, scale on failure | Minutes | Low (streaming replication) | Low-medium | Cross-region RDS read, EC2 standby |
| **Warm Standby** | Full replica running, ready to take traffic | Minutes | Near-zero (sync replication) | Medium | Aurora multi-AZ, cross-region read replica + ALB failover |
| **Multi-region Active-Active** | Full production in each region, traffic split | Seconds | Zero (continuous sync) | Highest | Global Accelerator, DynamoDB Global, Aurora Global |

> 💡 **Related theory**: Each step up trades speed for cost. Backup+Restore: cheapest, slowest. Active-Active: fastest, most expensive. Middle ground (Warm Standby) is **most popular for cloud** — define your RTO, buy just enough replica to hit it. "RTO 4h" doesn't need active-active; pilot light suffices.

> ⚠️ **Gotcha**: **Failover is not automatic in Pilot/Warm.** You must: (1) detect failure (CloudWatch alarm), (2) invoke failover (manual API call or Lambda). This is why **Circuit Breaker + Health Checks** matter — application detects bad region, stops sending traffic before you manually failover. Exam: "automatic failover" → DynamoDB Global (automatic) or manual + Lambda trigger (on-demand).

> 📚 **Case study**: 2013 **Netflix Simian Army** — forced chaos (Chaos Monkey killed random servers) to ensure resilience practices stuck. Lesson: DR is only proven by **running it.** Chaos Engineering (FIS, Gremlin) validates RTO/RPO before real failure hits.

## Observability Trio — Metrics, Logs, Traces

Observability is three orthogonal dimensions.

| Dimension | Queries | Cost | Retention | Use |
|---|---|---|---|---|
| **Metrics** (CloudWatch) | "What is CPU now?" | Low | 15mo (standard), 3y (long) | Aggregates (count, average, max), alarms, dashboards |
| **Logs** (CloudWatch Logs) | "What happened in this service at 3:05pm?" | Medium (storage + analysis) | Configurable (default 7y) | Troubleshooting, audit, compliance |
| **Traces** (X-Ray) | "Why did this request take 5s?" | High (per-request sampling) | 30 days (free), custom retention | Latency root cause, service dependencies |

> 💡 **Related theory**: **Metrics are sparse, logs are verbose, traces are structured.** Metrics: "API p99 latency = 500ms" (one number). Logs: "Request 123, queried DB, DB slow, retried" (narrative). Traces: "Request 123 → A (50ms) → B (200ms, retried) → C (250ms, success)" (path). Pro scenario: "Why did deploy hurt latency?" Metrics show spike, logs show "timeout," traces show "downstream service slow." Missing any dimension, you guess; all three, root cause is clear.

> 🔍 **Deeper**: **Log tiers exist for cost.** CloudWatch Logs (all logs) is most expensive. Log Insights queries run post-hoc, cost per gigabyte scanned. Solution: **Route logs by tier**: (1) INFO+ to long-term archive (S3, Athena query), (2) WARN+ to real-time CloudWatch (for alarms), (3) ERROR only to DLQ. Exam: "log cost explosion" → data tiering. Also, **ADOT (AWS Distro OpenTelemetry)** makes metrics/logs/traces portable; if observability SaaS contract changes, ADOT → new vendor without code change.

> 📚 **Case study**: Pinterest (2019) traffic spike, logging system didn't scale, cascaded to application logs being dropped. Result: no visibility, slower incident response. Lesson: **observability is part of capacity planning.** Log volume scales with traffic; must auto-scale storage and query.

## CloudWatch OAM (Observability Account Management)

Multi-account observability is hard. Aggregate metrics/logs/alarms across 100 accounts without central admin role? Slow before OAM.

**CloudWatch OAM** solves this: each spoke account shares metrics/logs/alarms to hub account (Monitoring Account). Hub admin sees unified dashboards, sets alarms on spoke data, no cross-account role needed.

> 💡 **Related theory**: OAM is **opt-in data sharing**, like Delegated Admin but for observability. Spoke account *shares*, hub account *receives*. Hub sees all, spokes see only their own. Enables **central compliance monitoring** (audit account sees all logs) and **central on-call** (single dashboard for all alarms).

> ⚠️ **Gotcha**: OAM does NOT aggregate logs into a central stream. Logs stay in spoke CloudWatch Logs group; hub can run Logs Insights across all spoke groups. Different from centralized logging stack (all logs → central Kinesis/Datadog), cheaper but less powerful.

## Chaos Engineering (FIS — Fault Injection Service)

Resilience is only proven by **failure.** Fault Injection Service runs controlled chaos: disable AZ, kill Lambda, corrupt data, inject latency. Then measure: did Circuit Breaker catch it? Did health check fail? Did we failover?

> 💡 **Related theory**: **Antifragility** (Nassim Taleb): system should improve under stress. Chaos engineering forces this. "Will my failover work?" → deploy FIS experiment in staging, trigger failover, measure RTO. Only then safe for prod.

> 📚 **Case study**: 2011 **AWS us-east-1 outage**, EBS volumes cascaded failure, many SaaS firms down for hours. Lesson: assumed redundancy works, didn't test it. Post-incident, industry adopted chaos engineering to validate.

## Unified Thread: Observability → Resilience → Chaos → Feedback

```
1. Observability: Metrics show spike, logs detail failure, traces pinpoint service
   ↓
2. Resilience: Circuit breaker stops bad requests, failover activates, cache masks outage
   ↓
3. Incident Response: Auto-remediation (Lambda from EventBridge), manual escalation (Incident Manager)
   ↓
4. Postmortem: "Why did failover take 10min? Why didn't alarm trigger?"
   ↓
5. Chaos Test: FIS experiment validates fix
   ↓
6. Prevention: Application updated, alerting refined, runbook improved
   → Repeat
```

> 🎯 **Scenario**: "Global SaaS, multi-region Aurora, 60 accounts. Metrics show one region latency spike. What's the sequence?" → (1) CloudWatch Alarm on p99 latency (observability), (2) X-Ray traces show "DB query slow" (pinpoint), (3) CloudWatch Cross-Region Alarm triggers failover to read-only replica (resilience), (4) Lambda auto-remediation increases read replica capacity (incident response), (5) Incident Manager pages on-call, escalates if unresolved in 5min (human loop), (6) Postmortem: "DB was under memory pressure" → FIS experiment tests "what if replica out of memory" → application now has circuit breaker for slow reads (prevention). Six steps, three domains (observability, resilience, incident response, with chaos validation).

## Summary

Today wove Domain 3+4's 36% together. First, **resilience starts with RTO/RPO business contracts**, which define architecture tier. Second, **four DR strategies** (Backup, Pilot, Warm, Active-Active) trade cost vs speed; choose tier that fits RTO. Third, **observability trio** (metrics, logs, traces) is orthogonal; all three needed for root cause. Fourth, **multi-account observability via OAM** centralizes hub monitoring. Fifth, **chaos engineering (FIS) validates resilience**, measured by RTO/RPO hit or miss. Sixth, **unified thread: observe → contain → remediate → test → prevent**, feedback loop hardens system.

Next: Domain 5+6 (incident response and security) closes final 18%.

---

## 📝 Practice Questions

**Question 1.** A fintech's relational database DR requirement is "RTO of 1 minute, RPO under 1 second, multi-Region." What is the most suitable solution, and why can it not guarantee an RPO of exactly zero?

A) RDS Multi-AZ — the RPO is 0

B) Aurora Global Database — it optimizes RPO to under 1 second with asynchronous cross-Region replication, but it uses asynchronous replication to avoid the latency cost of synchronous replication, so the RPO is not exactly 0

C) RDS cross-Region read replica — the RPO is 0

D) DynamoDB Streams — it supports SQL

**Answer: B**

Explanation: Aurora Global Database uses dedicated replication infrastructure to keep the cross-Region RPO typically under 1 second and provides failover with an RTO of about 1 minute. The reason the RPO is not exactly 0 is the reality of the CAP theorem — synchronous cross-Region replication imposes round-trip latency on every write, so Aurora Global uses asynchronous replication and optimizes that lag to under 1 second. RDS Multi-AZ (A) is single-Region (not multi-Region DR), a cross-Region read replica (C) has a worse RPO/RTO than Aurora Global, and DynamoDB (D) is key-value and not SQL.

---

**Question 2.** A client (a partner firewall) has whitelisted the destination IPs so the IPs cannot change, and failover within 1 second is needed when a Region fails. Why is Route 53 failover alone insufficient, and what is the correct choice?

A) Route 53 is enough — just set the TTL to 0

B) Route 53 is at the DNS layer, so TTL caching by clients/resolvers delays failover by tens of seconds to minutes, and the IPs also change. Global Accelerator provides two static Anycast IPs and fails over within about 1 second over the AWS backbone, so it fits this requirement

C) Use CloudFront

D) Place NLBs in multiple Regions

**Answer: B**

Explanation: Route 53 failover works by changing the DNS response, so clients and resolvers cache the previous IP for the TTL and some ignore the TTL, making failover slow, and the response IP itself changes — which violates the fixed-IP requirement. Global Accelerator gives Anycast IPs that do not change and switches to a healthy endpoint within about 1 second over the backbone without going through DNS. A TTL of 0 (A) also does not completely solve the DNS caching problem. CloudFront (C) is HTTP caching and does not provide fixed IPs, and a single-Region NLB (D) does not provide multi-Region failover by itself.

---

**Question 3.** You chose DynamoDB Global Tables for the requirement "write key-value data in both Active-Active Regions." If the additional condition "both changes must be preserved even when the same key is modified simultaneously in both Regions" is added, what limitation must be considered?

A) There is no limitation — Global Tables preserves both

B) Global Tables resolves conflicts with Last Writer Wins (LWW), so in a concurrent conflict the later write wins and the earlier write disappears. If "preserve both" is required, application-level conflict resolution (CRDTs/vector clocks) or a single-writer design is needed

C) Global Tables provides strong consistency, so there is no problem

D) Switching to Aurora Global solves it automatically

**Answer: B**

Explanation: DynamoDB Global Tables is Active-Active but resolves conflicts with LWW — the write with the later timestamp wins and the earlier write is silently lost. "Preserving both of the concurrently conflicting data" is impossible with LWW and requires application-level merge logic or a single writer. Global Tables is not strongly consistent (C). The secondary in Aurora Global (D) is read-only, so Active-Active writes are not possible at all.

---

**Question 4.** You want to verify in normal times that the resilience design of a service with millions of users works in a real outage. How can you inject AZ failures, instance terminations, and API throttling in a controlled way without them spreading into a real incident?

A) Scan for vulnerabilities with Amazon Inspector

B) Inject failures with AWS Fault Injection Simulator (FIS), and use a CloudWatch alarm-based stop condition to automatically halt the experiment if it exceeds a threshold

C) Send synthetic requests with CloudWatch Synthetics canaries

D) Detect threats with GuardDuty

**Answer: B**

Explanation: FIS is a chaos engineering tool that verifies resilience by deliberately injecting failures such as AZ outages, instance terminations, and throttling, and with a stop condition integrated with CloudWatch alarms, it halts the experiment immediately if it goes out of control (so that the experiment does not become a real incident). Inspector (A) is vulnerability scanning, Synthetics (C) is monitoring that mimics normal behavior, and GuardDuty (D) is threat detection — all have roles different from FIS, which "deliberately causes failures."

---

**Question 5.** You want to trace which service hop is delaying distributed requests across 50 microservices, but traffic is so large that tracing everything is costly and adds overhead. You also need to be able to send data to multiple backends without vendor lock-in. What is the most appropriate approach?

A) Trace 100% of requests with X-Ray

B) Instrument with ADOT (OpenTelemetry) and apply custom sampling rules (a high rate for critical paths, 0% for health checks) to collect only a representative sample

C) Analyze only logs with CloudWatch Logs Insights

D) Scan with Inspector

**Answer: B**

Explanation: Traces are the pillar that shows the causal path of distributed requests. Because tracing everything has high cost and overhead, use custom sampling to set critical paths high and health checks and the like to 0%, collecting a representative sample (statistical sampling). The vendor-neutral, multiple-backend requirement is met by ADOT, which is based on the OpenTelemetry standard. 100% tracing (A) explodes cost, Logs Insights (C) deals with logs rather than traces and cannot thread together the request path, and Inspector (D) is irrelevant.

---

**Question 6.** You need to retain several TB of application logs long-term while occasionally running large-scale analysis, but CloudWatch Logs Insights cost is a burden. What is the most cost-effective pattern?

A) Retain permanently in CloudWatch Logs and query with Insights each time

B) Archive long-term with a Subscription Filter → Kinesis Data Firehose → S3, and perform analysis with Athena/Glue (keep short-term CloudWatch retention for operational visibility)

C) Continuously load all logs into OpenSearch

D) Manually export logs daily with Lambda

**Answer: B**

Explanation: Logs Insights is billed per amount of data scanned, so repeated large queries are expensive. Tiering is cost-effective: use a Subscription Filter (a nearly free branch) to send logs through Firehose to S3 for low-cost long-term retention, and run analysis with Athena only when needed. Keep short-term operational visibility in CloudWatch with short retention. Permanent Logs retention (A) and continuous OpenSearch loading (C) explode cost, and manual export (D) is an operational-burden anti-pattern.

---

**Question 7.** You need to create high-cardinality custom metrics (for example, combinations of customer ID and Region) in a Lambda function, but the latency and cost of synchronous `PutMetricData` calls are a problem. What is the most appropriate method?

A) Run `PutMetricData` synchronously on every invocation

B) Include the metric definition in a structured log using Embedded Metric Format (EMF) and send it to CloudWatch Logs, and CloudWatch extracts the metrics automatically — eliminating synchronous API calls and making high-dimension metrics efficient

C) Create the metrics with X-Ray

D) Load the metrics into DynamoDB and then aggregate

**Answer: B**

Explanation: EMF is a method in which the metric is included in a single structured log line and CloudWatch extracts the metric from it automatically — it removes the synchronous `PutMetricData` call (latency and API cost), the metric comes along while you write the log, and high cardinality is efficient because it is log-based. Repeated PutMetricData (A) keeps the same cost and latency problems, X-Ray (C) is for traces and not metric extraction, and DynamoDB self-aggregation (D) is an operational burden.

---

## 📌 Today's Summary

Today we tied together 36% of Domains 3+4. First, resilience starts from the RTO/RPO business contract, which defines the architecture tiers. Second, the four DR strategies (backup, pilot light, warm standby, active-active) trade off cost against speed. Third, the three layers of observability (metrics, logs, traces) are orthogonal, and all are needed to identify the root cause. Fourth, multi-account observability is centralized with OAM. Fifth, chaos engineering (FIS) validates resilience and measures whether the RTO/RPO is achieved. Sixth, a single feedback loop: observe → isolate → self-heal → test → prevent, and this flow makes the system robust.
