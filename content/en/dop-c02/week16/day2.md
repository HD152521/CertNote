# Day 2 - Domains 3 and 4 Combined Review: The Math of Resilience and the Theory of Observability

If yesterday we threaded the whole flow of code reaching production into a single line, today we cover the two domains about how that code **holds up (resilience)** in production and how we **look inside (observability)** its state. Domain 3 (Resilience, 15%) and Domain 4 (Monitoring/Logging, 15%) together make up 30%, and they are two sides of the same coin. Resilience is "the ability to survive a failure," and observability is "the ability to know about a failure at the moment it happens, or even before." Resilience without observability is blind (the system is dying and you do not know), and observability without resilience is powerless (you see the problem but have no automated response). The DOP exam often weaves the two into a single question: "automate DR failover" demands resilience (routing switchover) and observability (a Health Check detecting the failure) at the same time.

Today's review does not stop at memorizing RTO/RPO as "minutes/seconds." We dig again into **the math of why those numbers are traded against cost**, and into the idea that observability is not just log collection but **a theory of reconstructing causality in distributed systems**.

## RTO and RPO - The Math of Two Time Axes That Determine Cost

The starting point for understanding DR strategies is two independent time axes: **RTO (Recovery Time Objective)** and **RPO (Recovery Point Objective)**. If you confuse them, you will fall apart on scenario questions.

- **RTO** is the **axis of time**. "The time allowed from the moment a failure occurs until service is restored." An RTO of 1 minute means "it must be back up within 1 minute."
- **RPO** is the **axis of data**. "The amount of data (expressed as time) that may be lost between the last good point and the moment of failure." An RPO of 1 second means "losing at most 1 second's worth of data is acceptable."

> The reason RTO and RPO are separate axes is that **recovery speed (the availability dimension)** and **data loss (the durability dimension)** are guaranteed by different mechanisms. RTO is a question of "how quickly can you bring up replacement infrastructure and redirect traffic" - the hotter the standby, the faster. RPO is a question of "how often and how synchronously do you replicate data" - with synchronous replication RPO is about 0, and with asynchronous replication RPO grows by the replication lag. The fundamental limit of distributed systems, the **CAP theorem**, comes into play here. When the network between two Regions is partitioned, keeping strong consistency (synchronous replication, RPO=0) means sacrificing availability (blocking writes), and keeping availability means sacrificing consistency (asynchronous, RPO>0). This is exactly why Aurora Global Database advertises "RPO under 1 second" but not 0 - it avoids the latency cost of synchronous cross-Region replication by using asynchronous replication, and the compromise is that it optimizes that lag to under 1 second. On the exam, if "RPO 0 (data loss absolutely unacceptable)" is required, you need single-Region synchronous replication (Multi-AZ) or Active-Active multi-write, and if it is "RPO of a few seconds acceptable + multi-Region DR," Aurora Global is the answer.

> The four DR strategies are essentially **four points on a "cold ↔ hot" spectrum**. Backup & Restore is fully cold (infrastructure is off and only backups exist → provision from scratch on recovery, RTO of hours to days), Pilot Light is "only the pilot flame is lit" (the core DB is replicating but the app tier is off → on failure only the app boots, RTO in tens of minutes), Warm Standby is a scaled-down full environment running at all times (it is up at small scale so you only need to scale up, RTO in minutes), and Active-Active is fully hot (both Regions handle traffic equally, RTO of about 0). Cost rises in exactly the opposite direction - the colder, the cheaper, and the hotter, the more expensive. This is **the trade-off between "preparation cost (always running) and recovery cost (borne at failure time)"**. Exam clue mapping: "lowest cost + a long RTO is fine" → Backup & Restore, "core data always current but the app normally off" → Pilot Light, "recovery within minutes + medium cost" → Warm Standby, "RTO 0 + cost no object" → Active-Active.

## The Division of Labor Among Multi-Region Tools - What Replicates Which Layer

The tools that implement DR strategies each take responsibility for a **different layer (data/routing/infrastructure)**. Knowing this division of labor gives you the exact combination in a scenario.

| Tool | Layer of responsibility | RPO/characteristics | Typical clue |
|------|------|------|------|
| Aurora Global Database | Relational DB | typical replication lag under 1 second, RTO in the order of minutes, up to 10 secondary Regions | "RTO 1 minute RPO 1 second SQL DB" |
| DynamoDB Global Tables | Key-value DB | Active-Active, LWW conflict resolution | "Simultaneous writes in two Regions, key-value" |
| S3 CRR / RTC | Object storage | CRR is asynchronous, RTC has a 15-minute SLA | "Guarantee S3 object replication within 15 minutes" |
| Route 53 | DNS routing | Failover/Latency/Weighted + Health Check | "DNS-based failover" |
| Global Accelerator | Network (L4) | Anycast IP, ~1 second failover, static IP | "Static IP + fast failover" |
| AWS Backup | Backup orchestration | Cross-Region/Account copy | "Central backup policy + Region replication" |
| CloudFormation StackSets | Infrastructure | Multi-Region/account template deployment | "Identical infrastructure in the DR Region" |

> **Route 53 and Global Accelerator both do "failover," but they operate at completely different layers.** Route 53 works at the **DNS layer (L7 name resolution)** - when a Health Check fails, it changes the DNS response to an alternative endpoint. The problem is **DNS caching (TTL)**. Clients and resolvers cache the previous IP for the TTL, so even with a short TTL (for example, 60 seconds) failover takes tens of seconds to several minutes, and some clients ignore the TTL. Global Accelerator works at the **network layer (Anycast IP)** - it gives users 2 fixed IPs that never change, and routes traffic arriving at those IPs over the AWS backbone to a healthy endpoint. When an endpoint dies, it redirects to another Region at the backbone level within ~1 second **without going through DNS**. So if the clue is "clients that cannot change IPs (firewall allowlists, IoT)" or "fast, 1-second-class failover," it is Global Accelerator, and if it is "standard, low-cost DNS failover," it is Route 53. The key: you must know the causality that Global Accelerator bypasses the limitation of DNS failover (TTL caching).

> ⚠️ **Pitfall**: DynamoDB Global Tables is **Active-Active and resolves conflicts with "Last Writer Wins (LWW)"**. This is not strong consistency - if the same key is written differently in two Regions at nearly the same time, the write with the later timestamp wins (the earlier write silently disappears). If the requirement is "even if the same record is modified simultaneously in two Regions, both must be preserved," LWW will not work and you need application-level conflict resolution (for example, CRDTs, vector clocks) or a single-writer design. On the exam, "Active-Active key-value" is almost always DynamoDB Global Tables, but when the extra condition "no data loss from concurrent conflicts" is attached, you should recall the limits of LWW. One more thing: the secondary Region of Aurora Global Database is **read-only** by default, and to accept writes an explicit **failover (promote)** must occur - it is not an Active-Active write DB.

> The major **AWS us-east-1 outage** of December 2021 (about 7 hours, starting from an internal network device auto-scaling issue) was a fresh reminder of the danger of depending on a single Region. Disney+, Netflix, Robinhood, and countless other services were affected, and what was especially shocking was that **the control planes of global services are tied to us-east-1**, so even organizations with workloads in other Regions had their management functions (API, console) paralyzed. The lessons: (1) us-east-1 is home to many global control planes, so "Region diversification" alone is not enough and you must look at control plane dependencies too, and (2) DR needs not only data replication but also **the failover procedure itself must not depend on the failed Region** (for example, a Lambda/pipeline that triggers failover is useless if it sits in the dead Region). This is why, when the DOP exam asks about "DR automation," it prefers designs that run Route 53 Health Check + EventBridge + Step Functions **on the DR Region side**.

## Chaos Engineering - How to "Prove" Resilience

Designing resilience is different from knowing that it actually works. **AWS Fault Injection Simulator (FIS)** deliberately injects failures (AZ down, instance termination, API throttling, network latency) to verify that the system really recovers.

> This is **Chaos Engineering**. Netflix established it around 2010 with **Chaos Monkey** (a tool that randomly kills production instances), and it later expanded to the Simian Army (Chaos Gorilla = AZ failure, Chaos Kong = Region failure). The core philosophy is **"assume failures will happen, trigger failures as controlled experiments, and discover the system's weaknesses in peacetime."** It has the same structure as the scientific method - form a hypothesis about the steady state, inject a real-world event (a failure), and observe whether the hypothesis holds. FIS offers these experiments as a managed service, together with **automatic stop conditions (integrated with CloudWatch Alarms)** so an experiment does not spill over into a real incident. On the exam, a clue about "verifying/testing resilience in advance" points to FIS, and you must not confuse it with Synthetics (synthetic monitoring) or Inspector (vulnerability scanning) - their roles differ: FIS "breaks things on purpose," Synthetics "mimics normal behavior to monitor," and Inspector "scans for vulnerabilities."

## The Three Pillars of Observability - What Do Logs, Metrics, and Traces Each Answer Differently

Moving on to Domain 4, the key is that the three pillars of **observability** - logs, metrics, and traces - each answer a different question.

| Pillar | Question it answers | Data form | AWS tools |
|------|------|------|------|
| Metrics | "What, and how much?" (aggregate numbers) | Time-series numbers | CloudWatch Metrics, Managed Prometheus |
| Logs | "What exactly happened?" (individual events) | Timestamped text | CloudWatch Logs, OpenSearch |
| Traces | "Where and why is it slow?" (request path) | Distributed spans | X-Ray, ADOT |

> The term "observability" comes from **control theory**. Observability as defined by Rudolf Kálmán in 1960 is "the degree to which a system's **internal state can be inferred from its external outputs alone**." Translated into software, a system is observable if you can infer "what is happening inside the system right now" from the external outputs of logs, metrics, and traces alone. This is where monitoring and observability diverge - **monitoring "answers questions I defined in advance (dashboards, alarms)"** (known-unknowns), and **observability "can answer questions I did not anticipate, after the fact"** (unknown-unknowns). Why all three pillars are needed: metrics quickly tell you "the error rate spiked" but do not know **why** (low-cardinality aggregates), logs hold individual events but cannot string together which services a single request passed through in a distributed system, and traces stitch that request path together to show "at which hop the time leaked." **Correlating** the three - a metric anomaly → the logs from that time → the trace of that request - is the heart of modern observability.

> **X-Ray sampling** is an easy point to get confused about on the Pro exam. Tracing every request would balloon cost and overhead, so X-Ray traces only "1 per second (reservoir) + 5% of the rest" under its **default sampling rule**. In high-traffic production this default can be too little (missing rare errors) or too much, so you adjust it with **custom sampling rules**, such as 100% for a specific path (`/checkout`) and 0% for health checks (`/health`). This is an application of **statistical sampling** - instead of a census, you estimate the behavior of the population (all requests) from a representative sample, while guaranteeing capture of rare but important events (errors) with a separate rule. As a successor and extension of X-Ray there is also **ADOT (AWS Distro for OpenTelemetry)**; OpenTelemetry is a vendor-neutral standard (CNCF), so it can send to multiple backends such as X-Ray, Prometheus, and Jaeger at once. On the exam, a clue of "open-source compatible, avoid vendor lock-in" means ADOT/OpenTelemetry, and "AWS-native distributed tracing" means X-Ray.

## Log Pipelines and Cost - Why Is Logs Insights Expensive

Logs are the richest pillar but the most expensive. Understanding the cost structure unlocks the exam's "long-term retention / large-volume analysis" pattern.

> ⚠️ **Pitfall**: **CloudWatch Logs Insights is billed per amount of data scanned**. Repeatedly querying multiple TB of logs interactively adds up fast. So when the clue is "long-term retention + large-volume analysis + low cost," the answer is not permanent retention in Logs but **Subscription Filter → Kinesis Data Firehose → S3 → Athena/Glue**. The key causality: CloudWatch Logs is optimal for "real-time, short-term operational visibility," while S3+Athena is optimal for "low-cost long-term retention + occasional large-volume analysis." A Subscription Filter is a nearly free path that **branches logs to the outside (Firehose, Lambda, OpenSearch) in near real time**, and this branching separates operations (CloudWatch) from analysis/retention (S3, OpenSearch) cost-effectively.

> **EMF (Embedded Metric Format)** is a clever trick that "reduces the cost of metrics and logs at the same time." Normally, to create a custom metric in Lambda you must call the `PutMetricData` API synchronously, which causes (1) extra latency, (2) API call costs, and (3) explosive cost for high-cardinality (many dimension combinations) metrics. With EMF, you **embed the metric definition in a single structured log line** and send it to CloudWatch Logs, and CloudWatch **automatically extracts the metric** from that log. In other words, the metric comes for free while you are writing the log anyway - the synchronous `PutMetricData` call disappears (lower latency and cost), and high-dimension metrics are efficient too because they are log-based. On the exam, "create high-cardinality custom metrics from Lambda cost- and performance-efficiently" means EMF.

> Since 2019, several SaaS companies have publicly complained about an "observability cost explosion" - as microservices multiply, log, metric, and trace data grow exponentially, and for some organizations the cost of observability tooling approached the cost of production infrastructure. This phenomenon made cost optimization patterns like EMF, sampling, and log tiering (hot=CloudWatch, cold=S3) standard. This is the background for why the DOP exam often attaches the qualifier "cost-effective" to observability questions - a plain "collect everything and put it into OpenSearch" is almost always a cost-trap wrong answer, and the correct answer is a layered one: "operations in CloudWatch, long-term/large-volume in S3+Athena, metrics via EMF."

## Multi-Account Observability - Signals Scattered, in One Place

If the metrics, logs, and traces of 50 accounts are scattered across each account, you cannot see the whole picture during an outage. **CloudWatch Cross-Account Observability (OAM, Observability Access Manager)** solves this.

> OAM is a one-way trust model of a **Sink (the monitoring account) and Links (the source accounts)**. You create a Sink in a central monitoring account, and when each source account sets up a Link to that Sink, the monitoring account can view the Metrics, Logs, and X-Ray Traces of all source accounts at a glance, **read-only** (rather than copying or moving data, it delegates cross-account read permission). This is **the observability version of the "centralized aggregation" pattern**, like the Tooling account Hub-Spoke seen in Domain 1 and Security Hub Delegated Admin in Domain 6. On the exam, the clue "consolidate multi-account metrics into a single dashboard" means OAM, and choices that solve it by scraping metrics with Lambda (operational burden) or with Grafana alone (implementing authentication and aggregation yourself) are anti-patterns.

```
Multi-account observability + DR integration
==================================================
  Source accounts (Link)            Monitoring account (Sink)
  ┌─ Metrics ──┐
  ├─ Logs ─────┼──── OAM ────►  Single dashboard + alarms
  └─ X-Ray ────┘                (cross-account read)

  DR failover flow (driven from the DR Region)
  Route 53 Health Check (or GA) ──failure detected──►
     EventBridge ──► Step Functions (Runbook)
        ├─ Aurora Global secondary promote
        ├─ Switch DNS/GA endpoint
        └─ SNS/Incident Manager notification
```

> 🎯 **Scenario**: "A global e-commerce company operates in ap-northeast-2 (primary) and us-east-1 (DR). Requirements: ① the SQL DB needs RTO 1 minute and RPO of a few seconds ② the shopping cart (key-value) must be handled in both Regions simultaneously ③ clients allowlist the IP so it cannot change, and failover must take 1 second ④ observability for 40 accounts in a single dashboard ⑤ the failover procedure must not depend on a primary Region failure." → ① **Aurora Global Database** (secondary promote). ② **DynamoDB Global Tables** (aware of the LWW limit). ③ **Global Accelerator** (static Anycast IP, bypassing DNS TTL). ④ **CloudWatch OAM** (Sink/Link). ⑤ Run the failover automation (Route 53/GA Health Check + EventBridge + Step Functions) **in the DR Region** - the lesson of the 2021 us-east-1 outage. The five clues cut across Domains 3, 3, 3, 4, 3.

## Wrap-Up

Today we bundled 30% of Domains 3+4 into five threads. First, **RTO (time axis) and RPO (data axis) are separate**, the CAP theorem forces a trade between RPO=0 and availability, and Aurora Global's "RPO under 1 second" is an asynchronous replication compromise. Second, **the four DR strategies are four points on a cold↔hot spectrum** where cost and RTO/RPO are inversely proportional, and mapping by clue (lowest cost / core only / minutes / RTO 0) gives an instant answer. Third, **Route 53 (DNS, TTL limit) and Global Accelerator (Anycast, static IP, 1 second) operate at different layers**, and the LWW of DynamoDB Global Tables and the read-only Aurora secondary are the traps. Fourth, **FIS proves resilience through chaos engineering**, and its role differs from Synthetics/Inspector. Fifth, **observability is the correlation of the three pillars of logs, metrics, and traces**, and X-Ray sampling, EMF, Logs Insights cost, Subscription Filter branching, and OAM central aggregation are the keys to cost-efficient observability; and, as in the 2021 us-east-1 lesson, failover automation must be driven from the DR Region.

In the next article, we thread Domain 5 (incidents) and Domain 6 (security/compliance) together again from the perspective of control theory and automated response.

---

## 📝 Practice Questions

**Question 1.** A fintech's relational database DR requirement is "RTO 1 minute, RPO under 1 second, multi-Region." What is the most suitable solution, and why does it not guarantee an RPO of exactly 0?

A) RDS Multi-AZ - RPO is 0

B) Aurora Global Database - it optimizes RPO to under 1 second with asynchronous cross-Region replication, but because it uses asynchronous replication to avoid the latency cost of synchronous replication, RPO is not exactly 0

C) RDS Cross-Region Read Replica - RPO is 0

D) DynamoDB Streams - it supports SQL

**Answer: B**

Explanation: Aurora Global Database uses dedicated replication infrastructure to typically keep cross-Region RPO under 1 second and provides failover with an RTO in the order of minutes. The reason RPO is not exactly 0 is the reality of the CAP theorem - synchronous cross-Region replication imposes round-trip latency on every write, so Aurora Global uses asynchronous replication and optimizes that lag to under 1 second. RDS Multi-AZ (A) is single-Region (not multi-Region DR), a Cross-Region RR (C) has worse RPO/RTO than Aurora Global, and DynamoDB (D) is key-value, not SQL.

---

**Question 2.** The client (a partner firewall) pins the destination IP in an allowlist so the IP cannot change, and failover within 1 second is needed during a Region failure. Why is Route 53 Failover alone insufficient, and what is the right choice?

A) Route 53 is enough - just set the TTL to 0

B) Route 53 is at the DNS layer, so TTL caching by clients/resolvers delays failover by tens of seconds to several minutes, and the IP also changes. Global Accelerator provides 2 static Anycast IPs and fails over within ~1 second over the AWS backbone, so it fits this requirement

C) Just use CloudFront

D) Just put an NLB in multiple Regions

**Answer: B**

Explanation: Route 53 failover works by changing the DNS response, so clients and resolvers cache the previous IP for the TTL and some ignore the TTL, making failover slow, and the response IP itself changes - violating the fixed-IP requirement. Global Accelerator gives Anycast IPs that never change and switches to a healthy endpoint at the backbone within ~1 second without going through DNS. A TTL of 0 (A) also does not fully solve the DNS caching problem. CloudFront (C) is HTTP caching and not a fixed IP, and a single-Region NLB (D) does not provide multi-Region failover on its own.

---

**Question 3.** You chose DynamoDB Global Tables for the requirement "write key-value data in both of two Active-Active Regions." If the additional condition "even if the same key is modified simultaneously in both Regions, both changes must be preserved" is attached, which limitation must you consider?

A) No limitation - Global Tables preserves both

B) Global Tables resolves conflicts with Last Writer Wins (LWW), so on a concurrent conflict the later write wins and the earlier write disappears. If "preserve both" is needed, you need application-level conflict resolution (CRDT/vector clocks) or a single-writer design

C) Global Tables is strongly consistent, so there is no problem

D) Switching to Aurora Global solves it automatically

**Answer: B**

Explanation: DynamoDB Global Tables is Active-Active but resolves conflicts with LWW - the write with the later timestamp wins and the earlier write is silently lost. "Preserve both of the concurrently conflicting data" is impossible with LWW and requires application-level merge logic or a single writer. Global Tables is not strongly consistent (C). The secondary of Aurora Global (D) is read-only, so Active-Active writes are not possible at all.

---

**Question 4.** You want to verify in peacetime that the resilience design of a service with millions of users actually works in a real failure. How do you inject AZ failures, instance termination, and API throttling in a controlled way so that it does not spill over into a real incident?

A) Scan for vulnerabilities with Amazon Inspector

B) Inject failures with AWS Fault Injection Simulator (FIS), and use a CloudWatch Alarm-based Stop Condition to stop the experiment automatically when it crosses a threshold

C) Synthetic requests with a CloudWatch Synthetics Canary

D) Detect threats with GuardDuty

**Answer: B**

Explanation: FIS is a chaos engineering tool that deliberately injects failures such as AZ down, instance termination, and throttling to verify resilience, and a Stop Condition integrated with CloudWatch Alarms halts the experiment immediately if it gets out of control (so the experiment does not become a real incident). Inspector (A) is vulnerability scanning, Synthetics (C) is monitoring that mimics normal behavior, and GuardDuty (D) is threat detection - all differ in role from FIS, which "breaks things on purpose."

---

**Question 5.** You want to trace at which service hop distributed requests across 50 microservices are delayed, but traffic is so heavy that tracing everything is costly and heavy on overhead. You also need to be able to send to multiple backends without vendor lock-in. What is the most appropriate approach?

A) Trace 100% of all requests with X-Ray

B) Instrument with ADOT (OpenTelemetry) and apply custom sampling rules (a high rate for important paths, 0% for health checks) to collect only a representative sample

C) Analyze only logs with CloudWatch Logs Insights

D) Scan with Inspector

**Answer: B**

Explanation: Traces are the pillar that shows the causal path of distributed requests. Tracing everything is costly and heavy on overhead, so with custom sampling you set important paths high and things like health checks to 0% to collect a representative sample (statistical sampling). The vendor-neutral, multi-backend requirement is met by ADOT, which is based on the OpenTelemetry standard. 100% tracing (A) causes a cost explosion, Logs Insights (C) is logs rather than traces and cannot string together the request path, and Inspector (D) is irrelevant.

---

**Question 6.** You need to retain multiple TB of application logs long-term and occasionally run large-volume analysis, but the cost of CloudWatch Logs Insights is a burden. What is the most cost-effective pattern?

A) Retain permanently in CloudWatch Logs and query with Insights each time

B) Retain long-term in S3 via Subscription Filter → Kinesis Data Firehose → S3, and run analysis with Athena/Glue (keep short-term CloudWatch retention for operational visibility)

C) Load all logs into OpenSearch at all times

D) Manually export logs daily with Lambda

**Answer: B**

Explanation: Logs Insights is billed per amount of data scanned, so repeated large-volume queries are expensive. The layered approach - low-cost long-term retention in S3 via a Subscription Filter (a nearly free branch) through Firehose, with analysis done with Athena only when needed - is cost-effective. Operational short-term visibility is kept in CloudWatch with a short retention. Permanent retention in Logs (A) and always-on loading into OpenSearch (C) cause cost explosions, and manual export (D) is an operational-burden anti-pattern.

---

**Question 7.** You need to create high-cardinality custom metrics (for example, combinations by customer ID and Region) in a Lambda function, but the latency and cost of synchronous `PutMetricData` calls are a problem. What is the most appropriate method?

A) Execute `PutMetricData` synchronously on every invocation

B) Use Embedded Metric Format (EMF): include the metric definition in a structured log and send it to CloudWatch Logs, and CloudWatch extracts the metric automatically - removing synchronous API calls and making high-dimension metrics efficient

C) Create the metrics with X-Ray

D) Load the metrics into DynamoDB and then aggregate

**Answer: B**

Explanation: EMF embeds the metric in a single structured log line, and CloudWatch automatically extracts the metric from it - eliminating the synchronous `PutMetricData` call (latency, API cost), the metric comes along while you are writing the log anyway, and high cardinality is efficient because it is log-based. Repeated PutMetricData (A) keeps the cost and latency problems, X-Ray (C) is tracing rather than metric extraction, and aggregating on your own in DynamoDB (D) is an operational burden.

---

## 📌 Today's Summary

1. RTO (time axis) and RPO (data axis) are separate, and the CAP theorem trades RPO=0 against availability (Aurora Global's under-1-second is an asynchronous compromise).
2. The four DR strategies are a cold↔hot spectrum with cost inversely proportional to RTO/RPO - instant mapping by clue.
3. Route 53 (DNS, TTL limit) and Global Accelerator (Anycast, static IP, 1 second) are at different layers, and DynamoDB LWW and the read-only Aurora secondary are the traps.
4. FIS proves resilience through chaos engineering, and its role differs from Synthetics/Inspector.
5. Observability is the correlation of logs, metrics, and traces, with EMF, sampling, Subscription Filter, and OAM as the cost-efficiency keys, and failover automation driven from the DR Region (the 2021 us-east-1 lesson).
