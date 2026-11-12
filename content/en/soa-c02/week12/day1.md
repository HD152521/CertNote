# Day 1 - Rereading Domains 1 and 2: Where Observability and Resilience Become One Flow

With the exam right around the corner, "reviewing" a domain usually ends up meaning re-memorizing a table. But SOA-C02 Domain 1 (Monitoring, Logging, and Remediation, 20%) and Domain 2 (Reliability and Business Continuity, 16%) are really **one operational loop** cut into a front half and a back half: observe so you can catch anomalies (Domain 1), and make the system withstand them on its own before they spread into outages (Domain 2). If you memorize the two separately, you get lost in the exam's scenario questions, where "observe -> detect -> respond -> recover -> audit" is mixed into a single sentence.

Instead of just listing the keyword tables for the two domains, this post digs into **why** each service was designed the way it was, at what time resolution CloudWatch metrics are actually stored, why CloudTrail and Config use fundamentally different data models, and where the two BCP numbers, RTO and RPO, come from. It is a review, but one layer deeper.

## How Is Observability Different from Monitoring? A Word from Control Theory

"Monitoring" and "Observability" are often used interchangeably, but they have different origins. Observability is a concept defined in 1960 by the control theorist Rudolf Kálmán: **how well you can infer a system's internal state from its external outputs alone** is that system's observability. Kálmán also defined controllability at the same time, and the two are the twin pillars of modern control system design.

Transplanting this definition into cloud operations makes the point clear. Monitoring is "answering questions you decided in advance": is CPU above 80%? Is the disk full? Observability, by contrast, is "the ability to answer questions you did not anticipate." The truly frightening failures in operations always come from outside what you expected. That is why you keep all three pillars: Metric (what, and how much), Log (what happened), and Trace (where the request went). If the three pillars are rich enough, even after a failure has hit you can work backward from external signals alone to what happened inside.

> 💡 **Related theory**: The three pillars of Observability (Metric/Log/Trace) differ in the dimension of data they carry. A Metric is a number over time (a time series); it is the cheapest to store and fastest to aggregate, but it does not know "why." A Log is a discrete event (text); it is rich in context, but voluminous and expensive to search. A Trace is the causal chain of a single request passing through multiple services in a distributed system, and it is the only way to find bottlenecks in microservices. The three must be handled differently in terms of cardinality (the number of unique values): if you put a high-cardinality dimension such as user_id into a metric as a dimension, the time series explode and costs soar. That is why AWS is designed so that high-cardinality information is pushed to logs (Logs Insights) or X-Ray traces, and metric dimensions are deliberately limited to low cardinality (instance type, AZ, and so on).

## The Time Resolution of CloudWatch Metrics: The Cost Structure Hidden Between One Minute and One Second

When "reviewing" CloudWatch, most people memorize only that standard metrics are 5 minutes and Detailed is 1 minute. But behind those numbers is CloudWatch's internal storage model, and the exam asks about the consequences of that model (data retention, resolution, cost).

EC2 standard metrics default to a **5-minute interval**. Turning on Detailed Monitoring brings it down to 1 minute, but extra charges apply. Custom metrics that you upload directly with PutMetricData, however, can be **high-resolution**, down to 1-second granularity. The difference between that 1 minute and 1 second is not a mere option; it is tied to the structure by which CloudWatch **automatically downsamples** data.

CloudWatch rolls data into coarser resolutions as time passes. It keeps 1-second data for only 3 hours, 1-minute data for 15 days, 5-minute data for 63 days, and 1-hour data for 455 days (15 months). In other words, when you query older data, only values automatically aggregated into larger time units remain. This is **roll-up**, a universal pattern in time-series databases: fine-grained data is expensive, so you keep recent data in fine detail and old data coarsely, balancing storage cost and query performance.

| Resolution | Retention | Use |
|--------|-----------|------|
| 1 second (high-res custom) | 3 hours | Catching sharp spikes (e.g., 1-second latency right after a deployment) |
| 1 minute | 15 days | General operational alarms |
| 5 minutes | 63 days | Standard EC2 metrics, weekly trends |
| 1 hour | 455 days (15 months) | Long-term capacity planning |

The real trap of high-resolution metrics lies in the **alarm evaluation period**. An alarm built on a standard metric is evaluated at a minimum interval of 60 seconds, but on a high-resolution (1-second) metric you can set alarms with 10-second or 30-second periods. A fast alarm enables a faster response, but a short evaluation period overreacts to transient spikes and causes the alarm to flap. So in practice, a high-resolution alarm gets an "M of N" datapoints condition (for example, 3 breaches out of the last 5 evaluations) to absorb the noise. On the exam, if "detect a sudden traffic spike faster" appears, the clue is a high-resolution custom metric plus a short evaluation period; but if "the alarm fires too often" appears, the answer is M-of-N or adjusting the evaluation period.

## CloudTrail and Config: The Same "History," but Opposite Data Models

CloudTrail and Config are a pair that is easy to get wrong on the exam. If you memorize "who deleted it = CloudTrail, what was the previous configuration = Config," the surface is right, but if you do not know **why** the two differ, you collapse on variant questions. The key is that the **nature** of the data the two services record is different.

CloudTrail is an **event-sourced** model. Every time an AWS API is called, it leaves one event: "who (principal), when (timestamp), what (eventName), from where (sourceIPAddress)." This is a record of verbs: `TerminateInstances`, `DeleteBucket`, `AttachRolePolicy`. You cannot ask CloudTrail "what is the state of this instance right now." CloudTrail knows only the flow of actions, not the current shape of a resource.

Config is a **state-snapshot** model. Each time a resource changes, it takes a **full configuration snapshot** of that resource and stacks them into a timeline. This is a record of nouns: "this security group had these rules as of 14:00." So you can ask Config, "what were this SG's inbound rules three days ago?" In exchange, Config does not directly tell you "who made that change" (that answer is in CloudTrail).

| | CloudTrail | Config |
|---|-----------|--------|
| Data model | Event sourcing (stream of API calls) | State snapshot (configuration timeline) |
| Unit of record | Verb (action) | Noun (resource state) |
| Question it answers | "Who did what, and when?" | "What did this resource look like at that time?" |
| Compliance | Audit trail | Rule evaluation (Config Rule) |
| Auto-remediation | None directly (via EventBridge) | Remediation (SSM Automation) |

The two are not competitors but **complements**. In a real incident investigation, you use Config to find on the timeline "when it entered the wrong state," then search CloudTrail for that moment to find out "who called that API." The full story emerges only when the two data models meet.

The 2019 Capital One data breach is a representative case showing the value of these two axes. A former AWS employee used an SSRF attack through a misconfigured WAF (web application firewall) to steal IAM credentials from EC2 instance metadata, and with that access pulled credit card application data on roughly 106 million people out of S3 buckets. In the post-incident investigation, CloudTrail logs showed an abnormal pattern of `ListBuckets` and bulk `GetObject` calls, and this became key evidence for sizing the scope of the breach. There were two lessons: (1) CloudTrail must be on for after-the-fact tracing to be possible (if it is off, there is no evidence), and (2) had real-time threat detection such as GuardDuty been in place, it would have caught this abnormal API pattern **while the attack was in progress**. That is why the SOA exam treats "organization-wide CloudTrail + GuardDuty always on" as practically a default best practice.

## The Heart of Remediation: Without Idempotency, Automation Makes Incidents Worse

You cannot finish Domain 1's "remediation" by just memorizing "Config Rule + SSM Automation." The real challenge of automatic remediation is **whether the same fix is safe to run multiple times**, that is, idempotency.

Automatic remediation usually reacts to events: when a Config Rule detects noncompliance it invokes Remediation, and that Remediation runs an SSM Automation Document. The problem is that in distributed systems there is almost no guarantee that an event is delivered **exactly once**. Both EventBridge and SQS default to **at-least-once** delivery, so the same event may be delivered in duplicate. If a fix such as "make the S3 bucket private" is written non-idempotently (for example, appending a new policy every time), duplicate execution can wreck the policy.

So a well-designed Remediation Document is **declarative**: "ensure it is in this state," not "add this." A fix that "turns on Block Public Access" is idempotent because turning it on again when it is already on does no harm. This is also why SSM State Manager is designed around an association model that "maintains the desired state": on each cycle it converges the current state toward the desired state, and when it already matches, it does nothing.

Idempotency is a pillar of automation system design. HTTP also defines GET, PUT, and DELETE as idempotent (sending the same request many times gives the same result) while POST is not (RFC 7231). This is why infrastructure automation tools (Ansible, Terraform, SSM) all aim for "declarative and idempotent": imperative ("run this") is vulnerable to duplicates and retries, whereas declarative ("make it this state") converges to the same result no matter how many times it runs. It is why, when building an automatic recovery loop, you should first ask, "Is it okay if this action runs twice?" If it is not, that automation will not prevent an outage but grow it.

## RTO and RPO: The Two Numbers of BCP, the Axes That Split DR Strategies

Domain 2 ultimately boils down to two numbers. **RTO (Recovery Time Objective)** is "how quickly you must recover after a failure" (a length of time), and **RPO (Recovery Point Objective)** is "how much data loss you tolerate" (a point reaching back into the past). The two are independent axes, and the four DR strategies are coordinates on this two-dimensional plane.

RPO is determined by the backup interval. If you back up every 6 hours, in the worst case you lose the 6 hours of data right before the failure (RPO = 6 hours). To bring RPO close to 0 you need synchronous or continuous replication. RTO is determined by the speed of the recovery procedure. Restoring everything from backup takes hours, but merely switching over to a standby environment that is already running takes minutes.

| Strategy | RTO | RPO | Cost | Core mechanism |
|------|-----|-----|------|---------------|
| **Backup & Restore** | Hours | Hours | Cheapest | Keep only backups, restore on failure |
| **Pilot Light** | 10 minutes to tens of minutes | Minutes | Medium | Continuously replicate only the core (DB), keep the rest off |
| **Warm Standby** | Within minutes | Seconds to minutes | Expensive | Run a scaled-down full stack at all times, scale up on failure |
| **Multi-Site Active-Active** | ~0 | ~0 | Most expensive | Every Region always handles traffic |

The key trade-off is clear: **the closer RTO and RPO get to 0, the more cost rises exponentially.** Active-Active converges to RTO/RPO of 0, but you must run double the infrastructure at all times. The exam almost always asks for "the right strategy for the cost": "recovery in minutes + moderate cost" is Pilot Light, and "near-zero downtime + willing to pay" is Warm Standby or Active-Active.

> ⚠️ **Pitfall**: If you mix up RTO and RPO, your answer is wrong. "Minimize data loss" is an RPO story (replication interval), and "minimize downtime" is an RTO story (switchover speed). For example, if "it is a financial transaction so not even one piece of data loss is allowed," RPO≈0 is required, so synchronous replication (Multi-AZ synchronous, Aurora continuous backup) is needed; and if "recovery may take hours but all the data must survive," RPO is small but RTO can be large, so Backup & Restore is enough. When the two numbers are given separately, the key to avoiding the trap is seeing which one forces the expensive mechanism.

## RDS Multi-AZ and Read Replicas: Synchronous and Asynchronous, Two Philosophies of Replication

The second most commonly missed pair in Domain 2 is RDS Multi-AZ and Read Replica. Both "replicate data," but **what they replicate for** is opposite, and that difference in purpose maps directly onto the difference in replication method, synchronous versus asynchronous.

Multi-AZ is replication for **high availability (HA)**. It places a standby replica in a different AZ of the same Region and replicates **synchronously**: when a write happens on the primary, it responds with success to the client only after the write is also confirmed on the standby. So even if the primary dies, the standby takes over without losing a single write (RPO≈0). In exchange, synchronous replication waits for a network round trip on every write, so you accept a little extra write latency. And the standby does not receive traffic during normal operation; it purely waits (it is not for read scaling).

A Read Replica is replication for **scaling read performance**. It replicates **asynchronously**: the primary finishes its own write and responds immediately, and replication follows in the background. So replication lag exists, and the replica always sees data slightly older than the primary. In exchange, being asynchronous, it has almost no effect on the primary's write performance, and you can place multiple replicas to spread the read load.

Synchronous versus asynchronous replication ties into the **CAP theorem**, a fundamental trade-off of distributed systems. Synchronous replication (Multi-AZ) prioritizes Consistency, guaranteeing all replicas have the same data, but at the cost of added latency and possibly shaky availability during a network partition. Asynchronous replication (Read Replica) prioritizes availability and performance but allows weak consistency (eventual consistency), where replicas temporarily fall behind. So if you send a workload that "must read right away the data it just wrote" to a Read Replica, a bug occurs where it reads old data because of the lag; this is a classic case of broken read-after-write consistency. Aurora's shared-storage architecture reduced this lag to typically within tens of milliseconds, but it is not zero. On the exam, if "read consistency matters, but using a Read Replica shows old data" appears, the answer is "replication lag; reads that need consistency must go to the primary."

## Wrap-Up

Domains 1 and 2 are one operational philosophy, "observe and endure," split into a front half and a back half. Memorize the keyword tables, but grasp the design intent behind them and variant questions become solvable.

In summary, there are five points. (1) Observability is "the ability to answer questions you did not anticipate," and Metric, Log, and Trace differ in cardinality and so must be handled differently. (2) CloudWatch metrics automatically roll up over time; high resolution (1 second) gives fast alarms, but absorb the noise with M-of-N. (3) CloudTrail is an event stream of verbs (API actions), and Config is a snapshot timeline of nouns (resource state); the two are complementary. (4) Idempotency is the lifeblood of automatic remediation: it must be declarative ("make it this state") to be safe against duplicate execution. (5) DR sits on the coordinates of two axes, RTO (recovery speed) and RPO (loss tolerance), and cost soars the closer to 0 you go. For RDS, Multi-AZ (synchronous, HA) and Read Replica (asynchronous, read scaling) differ in replication philosophy from the start.

In the next post, we reread Domain 3 (Deployment and Automation) and Domain 4 (Security) at the same depth: why CloudFormation is idempotent, in what order IAM policy evaluation reaches its decision, and the internal mechanism by which Session Manager replaces SSH.

---

## Practice Problems

**Question 1.** An operations team wants to capture short latency spikes that surge on a 1-second scale right after a deployment. However, that metric is normally recorded only at 5-minute intervals. What is the most appropriate approach?

A) Turning on Detailed Monitoring gives 1-second resolution
B) Push a high-resolution (1-second) custom metric with PutMetricData and set an alarm with a short evaluation period. Absorb the noise with an M-of-N datapoints condition
C) Trace the latency with CloudTrail
D) Looking at the average of the 5-minute metric is enough

**Answer: B**

Explanation: EC2 Detailed Monitoring goes down only to 1-minute resolution (not 1 second). 1-second resolution is possible only with high-resolution custom metrics uploaded via PutMetricData, and for these you can set alarms with 10- or 30-second evaluation periods. However, a short evaluation period overreacts to transient spikes and makes the alarm flap, so the practical pattern is to absorb the noise with a condition of M breaching datapoints out of the last N evaluations. CloudTrail (C) is API history, not a performance metric, and a 5-minute average (D) flattens and misses a 1-second spike.

---

**Question 2.** An S3 bucket was found to have become public at some point. You need to (1) see on a timeline when it entered that state, and (2) find out who called the API that made the change. Which service do you use for each?

A) (1) CloudTrail (2) Config
B) (1) Config (configuration snapshot timeline) (2) CloudTrail (API caller)
C) Both CloudWatch Logs
D) Both VPC Flow Logs

**Answer: B**

Explanation: Config is a state-based model that accumulates full configuration snapshots of a resource over time, so it answers "what state was it in and when" on a timeline. CloudTrail is an event stream of API calls, so it answers "who (the principal) called that change." The two have opposite data models and are complementary. In an incident investigation, you find the time of the change with Config, then search CloudTrail for that time to identify the caller. A, with the order swapped, reverses the roles of the two services.

---

**Question 3.** A Config Rule's automatic remediation ran the same SSM Document twice because of duplicate event delivery, and the second run broke the resource configuration. What is the root cause and the correct design principle?

A) SSM Automation does not support duplicate execution
B) The remediation Document was not written to be idempotent. EventBridge and SQS deliver at-least-once, so duplicates are possible, and remediation must be declarative and idempotent: "make it this state"
C) The Config Rule must be disabled
D) The Region must be changed

**Answer: B**

Explanation: Distributed event systems (EventBridge, SQS) guarantee at-least-once delivery by default, so the same event may be delivered more than once. Automatic remediation must therefore be written to be idempotent, producing the same result however many times it runs. This means a declarative form that "ensures this state" rather than "appends a policy." "Turn on public access block" is harmless even if it is already on, so it is idempotent. This is also why SSM State Manager uses an association model that converges to the desired state. The standard is to design to be safe against duplicates rather than trying to prevent duplicates themselves.

---

**Question 4.** It is a financial transaction DB, so not even a single piece of data loss is allowed (RPO≈0), but recovery taking a few minutes is acceptable. Which RDS configuration is most suitable?

A) Multiple Read Replicas
B) Multi-AZ: synchronous replication confirms the write to the standby before responding, so on primary failure it fails over without data loss (RPO≈0)
C) A snapshot once a day
D) Single AZ + frequent backups

**Answer: B**

Explanation: RPO≈0 (no loss allowed) forces synchronous replication. Multi-AZ confirms the primary's write synchronously to the standby in another AZ before returning success to the client, so even if the primary dies, the standby takes over without loss. Read Replicas (A) are asynchronous, so loss as large as the replication lag can occur and RPO 0 cannot be met. A daily snapshot (C) means up to 24 hours of loss in the worst case (RPO=24h). The key link is no loss allowed = synchronous replication = Multi-AZ (or Aurora continuous backup).

---

**Question 5.** An application reads data back immediately after writing it, but after sending the reads to a Read Replica, the data just written is sometimes not visible. What is the cause and the fix?

A) A Read Replica bug; replace it
B) Because of replication lag in asynchronous replication, the replica sees older data than the primary. Reads that need consistency must be sent to the primary
C) Switching to Multi-AZ will solve it
D) Turn off the cache

**Answer: B**

Explanation: A Read Replica uses asynchronous replication, so there is always some replication lag, and the replica sees a slightly older state than the primary. If you send reads that need read-after-write consistency ("read what you just wrote") to the replica, you get a bug where old data is read during the lag. The fix is to send reads where consistency matters to the primary and distribute only the reads that can tolerate the delay to replicas. Multi-AZ (C) is a standby for HA and does not receive read traffic, so it is not the answer for read scaling. This is a case of the consistency-availability trade-off of the CAP theorem showing up in reality.

---

**Question 6.** A company requires "near-zero downtime during a full Region outage (RTO within minutes) + near-zero data loss," but wants to save cost as much as possible. Normal traffic is fine on a single Region. What is the most balanced DR strategy?

A) Backup & Restore
B) Pilot Light
C) Warm Standby: keep a scaled-down full stack running at all times in a second Region, and scale out quickly to take traffic during an outage
D) Single-Region Multi-AZ

**Answer: C**

Explanation: Warm Standby is the standard when you require an RTO within minutes plus RPO≈0 but want to avoid the full cost of Active-Active. Because a small but always-running stack and continuously replicated data are kept in the second Region, during an outage you only need to scale out right away, with no "turn it on" time. Backup & Restore (A) has an RTO measured in hours and falls short of the near-zero-downtime requirement, and Pilot Light (B) keeps only the core (DB) on and the application tier off, so booting and scaling take longer. Multi-AZ (D) is single-Region HA and cannot protect against a full Region outage. Warm Standby is the balance point between "near-zero downtime" and "cost lower than Active-Active."

---

**Question 7.** If you view Observability as "the ability to answer questions you did not anticipate," why is it not recommended to put a dimension with millions of unique values, such as user_id, into a metric dimension?

A) AWS prohibits it
B) A high-cardinality dimension explodes the number of time series, causing cost and storage to surge. High-cardinality information should be handled with logs (Logs Insights) or traces (X-Ray), not metrics
C) Because user_id is not a number
D) Metrics do not support dimensions

**Answer: B**

Explanation: A metric is stored as a separate time series for each combination of dimensions. If you put a dimension whose cardinality (number of unique values) is in the millions, such as user_id, into a dimension, the time series explode into millions, and storage and aggregation costs surge. So the design principle is to deliberately limit metric dimensions to low cardinality, such as instance type or AZ, and to answer high-cardinality questions like "what happened to which user" with logs (Logs Insights queries) or distributed tracing (X-Ray). Dividing the three pillars (Metric/Log/Trace) by cardinality is the core operational skill of Observability.

---
