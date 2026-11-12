# Day 1 - AWS Organizations, Multi-Account Strategy

AWS Organizations centralize management of multiple accounts. Organizational Units (OUs) hierarchy. Service Control Policies (SCPs) enforce guardrails — deny specific APIs across accounts. Consolidated billing aggregates costs. Cross-account roles enable delegated access without credentials sharing.

Account structure strategy: separate production, development, security audit accounts. Delegated Admin accounts for services. Best practices: never use root credentials, enable CloudTrail per account, enable GuardDuty, enable Config rules.

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
