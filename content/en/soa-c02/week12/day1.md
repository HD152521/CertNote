# Day 1 - Rereading Domains 1 and 2, Where Observability and Resilience Become One Flow

"Reviewing" domains right before the exam usually ends up being re-memorizing tables. But SOA-C02 Domain 1 (Monitoring, Logging, and Remediation, 20%) and Domain 2 (Reliability and Business Continuity, 16%) are really **one operational loop** cut into front and back halves: observe to catch anomalies (Domain 1), and make the system endure on its own before those anomalies spread into outages (Domain 2). If you memorize them separately, you get lost on the exam's scenario questions, the ones where "observe → detect → respond → recover → audit" are mixed into a single sentence.

Instead of just listing the keyword tables for the two domains, this article digs into **why each service was designed the way it was**, at what time resolution CloudWatch metrics are actually stored, why CloudTrail and Config use fundamentally different data models, and where the two BCP numbers, RTO and RPO, came from. It is a review, but one layer deeper.

## How Observability Differs from Monitoring - A Word from Control Theory

"Monitoring" and "observability" are often used as the same word, but they have different origins. Observability is a concept defined in 1960 by the control theorist Rudolf Kálmán: **how well you can infer a system's internal state from its external outputs alone** is that system's observability. Kálmán also defined controllability at the same time, and the two are the twin pillars of modern control system design.

Transplanting this definition to cloud operations makes the core clear. Monitoring is "answering questions you decided in advance": is CPU over 80%? Is the disk full? Observability, on the other hand, is "the ability to answer questions you didn't anticipate." The truly scary outages in operations always come from the unexpected. That is why you keep all three axes: Metric (what, and how much), Log (what happened), and Trace (where a request went). If the three axes are rich enough, even after an outage hits you can trace back from external signals alone what happened inside.

> 💡 **Related theory**: The 3 axes of observability (Metric/Log/Trace) each differ in the dimension of the data. A Metric is a number over time (a time series), cheapest to store and fastest to aggregate, but it doesn't know "why." A Log is a discrete event (text), rich in context but large in volume and expensive to search. A Trace is the causal chain of one request passing through multiple services in a distributed system, and the only means of finding bottlenecks in microservices. The three must be treated differently in terms of cardinality (the number of unique values): putting a high-cardinality dimension like user_id into a metric as a dimension makes the time series explode and cost soar. So AWS is designed to push high-cardinality information to logs (Logs Insights) or X-Ray Traces and to keep metric dimensions deliberately limited to low cardinality (instance type, AZ, etc.).

## The Time Resolution of CloudWatch Metrics - The Cost Structure Hidden Between 1 Minute and 1 Second

When "reviewing" CloudWatch, most people memorize only standard metrics at 5 minutes and Detailed at 1 minute. But behind those numbers is CloudWatch's internal storage model, and the exam asks about the consequences of this model (data retention, resolution, cost).

EC2 standard metrics are at a default **5-minute interval**. Turning on Detailed Monitoring brings it down to 1 minute but adds a charge. Custom metrics you push directly with PutMetricData, however, can be **high-resolution**, down to 1-second granularity. The difference between this 1 minute and 1 second is not a simple option; it is entangled with the structure in which CloudWatch **automatically downsamples** data.

CloudWatch rolls data to coarser resolution as time passes. 1-second resolution data is kept only 3 hours, 1-minute data for 15 days, 5-minute data for 63 days, and 1-hour data for 455 days (15 months). That is, when you query older data, only values automatically aggregated into larger time units remain. This is the universal time-series database pattern of **roll-up**: fine-grained data is expensive, so you keep recent data finely and old data coarsely to balance storage cost and query performance.

| Resolution | Retention | Use |
|--------|-----------|------|
| 1 second (high-res custom) | 3 hours | Catching sharp spikes (for example, 1-second latency right after a deployment) |
| 1 minute | 15 days | General operational alarms |
| 5 minutes | 63 days | Standard EC2 metrics, weekly trends |
| 1 hour | 455 days (15 months) | Long-term capacity planning |

The real trap of high-resolution metrics lies in the **alarm evaluation period**. Alarms built on standard metrics evaluate at a minimum 60-second period, but on high-resolution (1-second) metrics you can set alarms with 10-second and 30-second periods. Faster alarms allow faster response, but a short evaluation period overreacts to transient spikes and causes the problem of alarms flapping. So in practice, you put an "M of N" datapoint condition on high-resolution alarms (for example, 3 of the last 5 evaluations in violation) to absorb the noise. On the exam, when "detect sudden traffic spikes faster" appears, a high-resolution custom metric + a short evaluation period is the clue, but when "the alarm fires too often" appears, M-of-N or adjusting the evaluation period is the answer.

## CloudTrail and Config - The Same "History," but Opposite Data Models

A pair that is easy to get wrong on the exam is CloudTrail and Config. If you memorize "who deleted it = CloudTrail, the previous configuration = Config," the surface is right, but if you don't know **why** they differ, you collapse on variant questions. The key is that the **essence** of the data the two services record is different.

CloudTrail is an **event-sourced** model. Every time an AWS API is called, it leaves one event of "who (principal), when (timestamp), what (eventName), from where (sourceIPAddress)." This is a record of verbs: `TerminateInstances`, `DeleteBucket`, `AttachRolePolicy`. You can't ask CloudTrail "what is this instance's state right now." CloudTrail knows only the flow of actions, not the current shape of a resource.

Config is a **state-snapshot** model. Each time a resource changes, it takes a **full configuration snapshot** of that resource and stacks them into a timeline. This is a record of nouns: "this security group had these rules at 14:00." So you can ask Config "what were this SG's inbound rules 3 days ago?" In exchange, Config doesn't directly tell you "who made that change" (that answer is in CloudTrail).

| | CloudTrail | Config |
|---|-----------|--------|
| Data model | Event sourcing (stream of API calls) | State snapshots (configuration timeline) |
| Unit of record | Verb (action) | Noun (resource state) |
| Question it answers | "Who did what and when" | "What did this resource look like at that time" |
| Compliance | Audit trail | Rule evaluation (Config Rule) |
| Auto remediation | None directly (via EventBridge) | Remediation (SSM Automation) |

The two are not competitors but **complements**. In a real incident investigation, you use Config to find "when it entered the wrong state" on the timeline, then search that point in CloudTrail to learn "who called that API." Only when the two data models meet do you get the whole story.

The 2019 Capital One data breach is a representative case showing the value of these two axes. A former AWS employee stole IAM credentials from EC2 instance metadata through an SSRF attack via a misconfigured WAF (web application firewall), and with those permissions pulled credit card application data on about 106 million people from S3 buckets. In the post-incident investigation, CloudTrail logs showed an abnormal pattern of `ListBuckets` and bulk `GetObject` calls, and this became the key evidence for scoping the breach. The lessons were two: (1) CloudTrail must be on for after-the-fact tracing to be possible (if it is off, there is no evidence), and (2) had there been real-time threat detection like GuardDuty, it would have caught this abnormal API pattern **while the attack was in progress**. That is why the SOA exam treats "organization-wide CloudTrail + GuardDuty always enabled" almost as a baseline best practice.

## The Heart of Auto Remediation - Without Idempotency, Automation Magnifies Incidents

Domain 1's "Remediation" can't be memorized and left at "Config Rule + SSM Automation." The real challenge of auto remediation is **whether the same fix is safe if run multiple times**, that is, idempotency.

Auto remediation usually reacts to events: when a Config Rule detects noncompliance it calls Remediation, and that Remediation runs an SSM Automation Document. The problem is that in distributed systems there is almost no guarantee that events are delivered **exactly once**. Both EventBridge and SQS default to **at-least-once** delivery, meaning the same event can be delivered in duplicate. If the fix "make the S3 bucket private" is written non-idempotently (for example, appending a new policy every time), duplicate execution can wreck the policy.

So a well-designed Remediation Document is **declarative**: it says "ensure this state," not "add this." The fix "turn on Block Public Access" is idempotent because turning it on again when it is already on is harmless. This is also why SSM State Manager is designed with an association model that "maintains the desired state": each cycle it converges the current state to the desired state, but if it is already right, it does nothing.

Idempotency is a pillar of automation system design. HTTP also defines GET, PUT, and DELETE as idempotent (sending the same request several times gives the same result) while POST is not (RFC 7231). This is why infrastructure automation tools (Ansible, Terraform, SSM) all aim to be "declarative and idempotent": imperative ("run this") is vulnerable to duplicates and retries, but declarative ("make it this state") converges to the same result no matter how many times it runs. It is why, when building an automatic recovery loop, you should first ask "is it OK if this action runs twice?" If it isn't, that automation magnifies the outage instead of preventing it.

## RTO and RPO - The Two Numbers of BCP as the Coordinate Axes That Divide DR Strategies

Domain 2 ultimately compresses into two numbers. **RTO (Recovery Time Objective)** is "how fast must we recover after an outage" (a length of time), and **RPO (Recovery Point Objective)** is "how much data loss we tolerate" (a point reaching back into the past). The two are independent axes, and the 4 DR strategies are coordinates on this 2-dimensional plane.

RPO is determined by the backup interval. If you back up every 6 hours, in the worst case you lose the 6 hours of data right before the outage (RPO = 6 hours). To bring RPO near 0 you need synchronous or continuous replication. RTO is determined by the speed of the recovery procedure. Restoring everything from a backup takes hours, but merely switching over to an already running standby environment takes minutes.

| Strategy | RTO | RPO | Cost | Key mechanism |
|------|-----|-----|------|---------------|
| **Backup & Restore** | Hours | Hours | Cheapest | Keep only backups, restore on failure |
| **Pilot Light** | 10 minutes to tens of minutes | Minutes | Medium | Replicate only the core (DB) continuously, keep the rest off |
| **Warm Standby** | Within minutes | Seconds to minutes | Expensive | A scaled-down full stack always running, scale out on failure |
| **Multi-Site Active-Active** | ~0 | ~0 | Most expensive | All Regions always process traffic |

The key trade-off is clear: **the closer you push RTO and RPO to 0, the more cost rises exponentially.** Active-Active converges to RTO/RPO of 0 but requires running double the infrastructure all the time. The exam almost always asks for "the right strategy for the cost": "minute-level recovery + moderate cost" is Pilot Light, and "near-zero downtime + accept the cost" is Warm Standby or Active-Active.

> ⚠️ **Pitfall**: If you mix up RTO and RPO, the answer is wrong. "Minimize data loss" is an RPO story (replication interval), and "minimize downtime" is an RTO story (switchover speed). For example, if "it's a financial transaction so not even 1 record of data loss is allowed," RPO≈0 is required and so synchronous replication (Multi-AZ synchronous, Aurora continuous backup) is needed, and if "recovery may take hours but all data must be preserved," RPO must be small but RTO can be large, so Backup & Restore is enough. When the two numbers are given separately, looking at which one forces the expensive mechanism is the key to avoiding the trap.

## RDS Multi-AZ and Read Replica - Synchronous and Asynchronous, Two Philosophies of Replication

The second most commonly missed pair in Domain 2 is RDS Multi-AZ and Read Replica. Both "replicate data," but **what they replicate for** is opposite, and that difference in purpose connects directly to the difference in replication method: synchronous vs asynchronous.

Multi-AZ is replication for **high availability (HA)**. It places a standby replica in a different AZ of the same Region and replicates **synchronously**: when a write happens on the primary, it responds with success to the client only after the write is confirmed on the standby as well. So even if the primary dies, the standby takes over without losing a single record (RPO≈0). In exchange, synchronous replication waits for a network round trip on every write, so you accept slightly higher write latency. And the standby doesn't receive traffic normally; it purely waits (it is not read scaling).

A Read Replica is replication for **scaling read performance**. It replicates **asynchronously**: the primary finishes its own write and responds right away, and replication follows in the background. So replication lag exists, and the replica always sees slightly older data than the primary. In exchange, being asynchronous, it barely affects the primary's write performance, and you can place several replicas to spread read load.

Synchronous vs asynchronous replication connects to the **CAP theorem**, a fundamental trade-off of distributed systems. Synchronous replication (Multi-AZ) prioritizes consistency so all replicas are guaranteed to hold the same data, but at the cost of increased latency and possibly shaky availability during a network partition. Asynchronous replication (Read Replica) prioritizes availability and performance but allows weak consistency (eventual consistency) where replicas temporarily fall behind. So if you send a workload that "must read right back what it just wrote" to a Read Replica, the lag causes a bug where it reads old data. This is a classic case of broken read-after-write consistency. Aurora reduced this lag to usually within tens of milliseconds thanks to its shared storage structure, but it isn't zero. On the exam, when "read consistency matters but using a Read Replica shows old data" appears, the answer is "replication lag: reads that need consistency must go to the primary."

## Wrapping Up

Domains 1 and 2 split one operating philosophy, "observe and endure," into front and back halves. Memorize the keyword tables, but once you grasp the design intent behind them, variant questions get solved.

In summary, five points. (1) Observability is "the ability to answer even unexpected questions," and Metric, Log, and Trace differ in cardinality and must be handled differently. (2) CloudWatch metrics are automatically rolled up as time passes, and high resolution (1 second) gives fast alarms but you absorb noise with M-of-N. (3) CloudTrail is an event stream of verbs (API actions) and Config is a snapshot timeline of nouns (resource state); they are complements. (4) For auto remediation, idempotency is vital: it must be declarative ("make it this state") to be safe against duplicate execution. (5) DR sits on coordinates of two axes, RTO (recovery speed) and RPO (loss tolerance), and cost explodes the closer to 0 you go. For RDS, Multi-AZ (synchronous, HA) and Read Replica (asynchronous, read scaling) differ in replication philosophy from the start.

In the next article we reread Domain 3 (Deployment and Automation) and Domain 4 (Security) at the same depth: why CloudFormation is idempotent, in what order IAM policy evaluation is decided, and the internal mechanism by which Session Manager replaces SSH.

---

## 📝 Practice Questions

**Question 1.** The operations team wants to capture short latency spikes that surge at 1-second granularity right after a deployment. But normally that metric is recorded only at 5-minute granularity. What is the most appropriate approach?

A) Turning on Detailed Monitoring gives 1-second resolution

B) Push a high-resolution (1-second) custom metric with PutMetricData and set an alarm with a short evaluation period. But absorb the noise with an M-of-N datapoint condition

C) Track the latency with CloudTrail

D) Looking at the average of the 5-minute metric is enough

**Answer: B**

Explanation: EC2 Detailed Monitoring goes down only to 1-minute resolution (not 1 second). 1-second resolution is possible only with high-resolution custom metrics pushed through PutMetricData, and on these you can set alarms with 10- and 30-second evaluation periods. However, a short evaluation period overreacts to transient spikes and makes alarms flap, so absorbing the noise with an M-violations-out-of-the-last-N-evaluations condition is the practical pattern. CloudTrail (C) is API history, not performance metrics, and the 5-minute average (D) flattens and misses a 1-second spike.

---

**Question 2.** An S3 bucket became public at some point. You need to (1) see on a timeline when it entered that state, and (2) find out who called the API that made the change. Which service do you use for each?

A) (1) CloudTrail (2) Config

B) (1) Config (configuration snapshot timeline) (2) CloudTrail (API caller)

C) Both CloudWatch Logs

D) Both VPC Flow Logs

**Answer: B**

Explanation: Config is a state-based model that stacks full configuration snapshots of a resource in time order, so it answers "what state it was in and when" on the timeline. CloudTrail is an event stream of API calls, so it answers "who called that change (the principal)." The two have opposite data models and are complements: in an incident investigation you find the change time with Config, then search that point in CloudTrail to identify the caller. A, which swaps the order, reverses the roles of the two services.

---

**Question 3.** A Config Rule's auto remediation ran the same SSM Document twice because of duplicate event delivery, and the second run wrecked the resource configuration. What is the root cause and the correct design principle?

A) SSM Automation doesn't support duplicate execution

B) The Remediation Document was written non-idempotently. EventBridge and SQS deliver at-least-once so duplicates are possible, so the fix must be declarative and idempotent in the sense of "make it this state"

C) The Config Rule must be disabled

D) The Region must be changed

**Answer: B**

Explanation: Distributed event systems (EventBridge, SQS) guarantee at-least-once delivery by default, so the same event can be delivered in duplicate. Therefore auto remediation must be written idempotently, so that running it several times gives the same result: a declarative form that "ensures this state," not "appends a policy." "Turn on Block Public Access" is idempotent because it is harmless if already on. This is also why SSM State Manager uses an association model that converges to the desired state. The standard approach is to design to be safe against duplicates rather than trying to prevent duplicates themselves.

---

**Question 4.** It is a financial transaction DB, so not even 1 record of data loss is allowed (RPO≈0), but recovery taking a few minutes is tolerated. What is the best RDS configuration?

A) Multiple Read Replicas

B) Multi-AZ - synchronous replication responds only after the write is confirmed on the standby, so it fails over with no data loss (RPO≈0) when the primary fails

C) A snapshot once a day

D) Single AZ + frequent backups

**Answer: B**

Explanation: RPO≈0 (no loss allowed) forces synchronous replication. Multi-AZ responds with success to the client only after confirming the primary write on the standby in another AZ synchronously, so even if the primary dies, the standby takes over without loss. A Read Replica (A) is asynchronous, so loss up to the replication lag is possible and it can't meet RPO 0. A daily snapshot (C) means in the worst case 24 hours of loss (RPO=24h). No loss allowed = synchronous replication = Multi-AZ (or Aurora continuous backup) is the key link.

---

**Question 5.** An application reads data right back after writing it, but when reads are sent to a Read Replica, the data it just wrote sometimes isn't visible. What are the cause and the fix?

A) A Read Replica bug - replace it

B) Because of the replication lag of asynchronous replication, the replica sees older data than the primary; reads that need consistency must go to the primary

C) Switching to Multi-AZ fixes it

D) Turn off the cache

**Answer: B**

Explanation: A Read Replica uses asynchronous replication, so there is always some replication lag, and the replica sees a slightly older state than the primary. If you send reads that need read-after-write consistency ("read right back what was just written") to a replica, you get a bug where old data is read during the lag. The fix is to send reads where consistency matters to the primary and spread only lag-tolerant reads to replicas. Multi-AZ (C) is an HA standby that doesn't receive read traffic, so it isn't the answer for read scaling. This is a case of the CAP theorem's consistency-availability trade-off showing up in reality.

---

**Question 6.** A company requires "near-zero downtime on a Region-wide failure (RTO within minutes) + almost no data loss," but wants to save cost as much as possible. Normal traffic is fine with one Region. What is the most balanced DR strategy?

A) Backup & Restore

B) Pilot Light

C) Warm Standby - keep a scaled-down full stack always running in a second Region, and scale out quickly to take traffic on failure

D) Single-Region Multi-AZ

**Answer: C**

Explanation: Warm Standby is the standard when you demand RTO within minutes + RPO≈0 but want to avoid the full cost of Active-Active. Because a small but always-running stack and continuously replicated data sit in the second Region, on failure you only need to scale out right away with no "turn-on" time. Backup & Restore (A) has an RTO in hours and falls short of a near-zero-downtime requirement, and Pilot Light (B) keeps only the core (DB) on with the app tier off, so boot and scale-out take longer. Multi-AZ (D) is single-Region HA and can't prevent a Region-wide failure. Warm Standby is the balance point between "near-zero downtime" and "cost cheaper than Active-Active."

---

**Question 7.** If you view observability as "the ability to answer even unexpected questions," why is it not recommended to put a dimension with millions of unique values, like user_id, into a metric dimension?

A) AWS forbids it

B) A high-cardinality dimension explodes the number of time series, sharply raising cost and storage; high-cardinality information should be handled with logs (Logs Insights) or traces (X-Ray), not metrics

C) Because user_id is not a number

D) Metrics don't support dimensions

**Answer: B**

Explanation: A metric is stored as a separate time series for each dimension combination. If you put a dimension with millions of cardinality (unique values), like user_id, as a dimension, the time series explode into millions and storage and aggregation cost surge. So metric dimensions are deliberately limited to low cardinality like instance type and AZ, and the design principle is to answer high-cardinality questions like "what happened to which user" with logs (Logs Insights queries) or distributed tracing (X-Ray). Splitting the three axes (Metric/Log/Trace) according to cardinality is the core operational skill of observability.

---

## 📌 Today's Summary

1. Domains 1 and 2 are one operational loop of "observe and endure": observability is the ability to answer unexpected questions, and Metric, Log, and Trace differ in cardinality
2. CloudWatch metrics are rolled up automatically over time (1 second → 3h, 1 minute → 15 days, 5 minutes → 63 days, 1 hour → 15 months). High resolution gives fast alarms, with noise absorbed by M-of-N
3. CloudTrail = an event stream of verbs (API), Config = a snapshot timeline of nouns (resource state). Complements: the point in time from Config, the caller from CloudTrail
4. For auto remediation, idempotency is vital: events are delivered at-least-once so duplicates are possible, so it must be declarative ("make it this state") to be safe
5. DR is coordinates on two axes, RTO (recovery speed) and RPO (loss tolerance); cost explodes the closer to 0. RDS Multi-AZ (synchronous, HA, RPO 0) vs Read Replica (asynchronous, read scaling, lag exists)
