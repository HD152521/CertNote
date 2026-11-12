# Day 2 - Domain 3+4 Integrated: Resilience and Observability as Failure Prevention

Yesterday we threaded the flow of code into production into a single line. Today we cover the two domains concerned with how that code **survives (resilience)** in production and how we **look inside (observability)** it. Domain 3 (Resilience, 15%) and Domain 4 (Monitoring/Logging, 15%) add up to 30%, and the two are two sides of the same coin. Resilience is "the ability to survive when a failure happens"; observability is "the ability to know about a failure at the moment it happens, or before." Resilience without observability is blind (the system is dying and you don't know it), and observability without resilience is powerless (you see the problem but have no automated response). The DOP exam often weaves the two into a single question — a question that says "automate the DR failover" demands both resilience (routing switch) and observability (a Health Check detecting the failure).

Today's review does not stop at memorizing RTO/RPO as "minutes/seconds." It digs back into **the math of why those numbers are traded against cost**, and into the fact that observability is not mere log collection but **a theory of reconstructing causality in a distributed system**.

## RTO and RPO — The Math of How Two Time Axes Determine Cost

The starting point for understanding DR strategies is two independent time axes: **RTO (Recovery Time Objective)** and **RPO (Recovery Point Objective)**. If you confuse them, you collapse on scenario questions.

- **RTO** is the **time axis**. "The time allowed from the occurrence of a failure until the service is restored." An RTO of 1 minute means "it must be back up within 1 minute."
- **RPO** is the **data axis**. "The amount of data (expressed in time) you may lose between the last good point and the moment of failure." An RPO of 1 second means "you may lose at most 1 second's worth of data."

> RTO and RPO are separate axes because **recovery speed (the availability dimension)** and **data loss (the durability dimension)** are guaranteed by different mechanisms. RTO is a question of "how quickly can you bring up replacement infrastructure and shift traffic" — the hotter the standby, the faster. RPO is a question of "how often, and how synchronously, do you replicate the data" — with synchronous replication, RPO≈0; with asynchronous replication, RPO grows by the replication lag. Here the fundamental limit of distributed systems, the **CAP theorem**, steps in. When the network between two Regions is partitioned, keeping strong consistency (synchronous replication, RPO=0) means sacrificing availability (blocking writes), and keeping availability means sacrificing consistency (asynchronous, RPO>0). This is exactly why Aurora Global Database advertises "RPO under 1 second" but not 0 — to avoid the latency cost of synchronous cross-Region replication it uses asynchronous replication, but it is a compromise in which that lag is optimized to under 1 second. If the exam demands "RPO 0 (data loss absolutely unacceptable)," you need single-Region synchronous replication (Multi-AZ) or Active-Active multi-writer; if it says "RPO of a few seconds is tolerable + multi-Region DR," Aurora Global is the answer.

> The four DR strategies are essentially **four points on a "cold ↔ hot" spectrum**. Backup & Restore is fully cold (infrastructure is off and only backups exist → on recovery you provision from scratch, RTO hours to days); Pilot Light is "only the pilot flame kept lit" (the core DB is replicating but the application tier is off → on failure only the app boots, RTO in the tens of minutes); Warm Standby is a scaled-down full environment running all the time (it is up at small scale so you only need to scale up, RTO in minutes); Active-Active is fully hot (both Regions handle traffic equally, RTO≈0). Cost rises in exactly the opposite way — the colder, the cheaper; the hotter, the more expensive. This is **the trade-off between "readiness cost (always running) vs recovery cost (borne at failure time)."** Exam clue mapping: "lowest cost + a long RTO is acceptable" → Backup & Restore; "core data always current but the app is normally off" → Pilot Light; "recovery within minutes + medium cost" → Warm Standby; "RTO 0 + cost irrelevant" → Active-Active.

## Division of Labor Among Multi-Region Tools — Which Tool Replicates Which Layer

The tools that implement a DR strategy are each responsible for a **different layer (data/routing/infrastructure)**. Knowing this division of labor yields the exact combination in a scenario.

| Tool | Layer of responsibility | RPO/characteristics | Typical clue |
|------|------|------|------|
| Aurora Global Database | Relational DB | RPO <1 sec, RTO ~1 min, up to 5-10 Regions | "RTO 1 minute RPO 1 second SQL DB" |
| DynamoDB Global Tables | Key-value DB | Active-Active, LWW conflict resolution | "simultaneous writes in two Regions, key-value" |
| S3 CRR / RTC | Object storage | CRR asynchronous, RTC 15-minute SLA | "guarantee S3 object replication within 15 minutes" |
| Route 53 | DNS routing | Failover/Latency/Weighted + Health Check | "DNS-based failover" |
| Global Accelerator | Network (L4) | Anycast IP, ~1 sec failover, static IP | "static IP + fast failover" |
| AWS Backup | Backup orchestration | Cross-Region/Account copy | "central backup policy + Region replication" |
| CloudFormation StackSets | Infrastructure | Multi-Region/account template deployment | "same infrastructure in the DR Region" |

> **Route 53 and Global Accelerator both do "failover," but they operate at completely different layers.** Route 53 operates at the **DNS layer (L7 name resolution)** — when a Health Check fails, it changes the DNS response to an alternative endpoint. The problem is **DNS caching (TTL)**. Clients and resolvers cache the old IP for the TTL, so even with a short TTL (say 60 seconds) failover takes tens of seconds to several minutes, and some clients ignore the TTL. Global Accelerator operates at the **network layer (Anycast IP)** — it gives users 2 unchanging static IPs and routes traffic arriving at those IPs to a healthy endpoint over the AWS backbone. If an endpoint dies, it shifts to another Region at the backbone level within ~1 second, **without going through DNS**. So if the clue is "clients that cannot change IPs (firewall allowlists, IoT)" or "1-second-class fast failover," choose Global Accelerator; if it is "standard, low-cost DNS failover," choose Route 53. The key is to understand the causality: Global Accelerator bypasses the limit of DNS failover (TTL caching).

> ⚠️ **Pitfall**: DynamoDB Global Tables are **Active-Active and resolve conflicts with "Last Writer Wins (LWW)."** This is not strong consistency — if two Regions write the same key differently at almost the same time, the write with the later timestamp wins (the earlier write silently disappears). If the requirement is "both must be preserved even if the same record is modified concurrently in two Regions," LWW will not do, and you need application-level conflict resolution (e.g., CRDTs, vector clocks) or a single-writer design. On the exam, "Active-Active key-value" is almost always DynamoDB Global Tables, but when an extra condition like "no data loss on concurrent conflicts" is attached, recall the limits of LWW. One more thing: the secondary Region of Aurora Global Database is **read-only** by default, and to accept writes an explicit **failover (promote)** must occur — it is not an Active-Active write DB.

> The **large-scale AWS us-east-1 outage** of December 2021 (about 7 hours, starting from an auto-scaling issue in an internal network device) reminded everyone of the danger of depending on a single Region. Disney+, Netflix, Robinhood, and many other services were affected, and what was especially shocking was that **the control planes of global services are tied to us-east-1**, so even organizations with workloads in other Regions had their management functions (APIs and console) paralyzed. Lessons: (1) us-east-1 is home to many global control planes, so "Region diversification" alone is not enough and you must look at control-plane dependencies too, and (2) DR must ensure **the failover procedure itself does not depend on the failed Region** (e.g., a Lambda/pipeline that triggers failover is useless if it lives in the dead Region). This is why, when the DOP exam asks about "DR automation," it prefers a design that runs Route 53 Health Check + EventBridge + Step Functions **on the DR Region side**.

## Chaos Engineering — How to "Prove" Resilience

Designing resilience is different from knowing that it actually works. **AWS Fault Injection Simulator (FIS)** deliberately injects failures (AZ down, instance termination, API throttling, network latency) to verify that the system really recovers.

> This is **Chaos Engineering**. Netflix established it around 2010 with **Chaos Monkey** (a tool that randomly kills production instances), and it later expanded into the Simian Army (Chaos Gorilla = AZ failure, Chaos Kong = Region failure). The core philosophy is **"assume failures will happen, cause failures as controlled experiments, and discover the system's weaknesses in peacetime."** It has the same structure as the scientific method — form a hypothesis about the steady state, inject a real-world event (a failure), and observe whether the hypothesis holds. FIS provides these experiments as a managed service, together with **automatic stop conditions (stop condition, integrated with CloudWatch Alarms)** so that an experiment does not spill over into a real incident. On the exam, a clue of "proactively verify/test resilience" makes FIS the answer, and you must not confuse it with Synthetics (synthetic monitoring) or Inspector (vulnerability scanning) — their roles differ: FIS "breaks things on purpose," Synthetics "mimics normal behavior to watch it," and Inspector "scans for vulnerabilities."

## The Three Pillars of Observability — What Do Logs, Metrics, and Traces Each Answer Differently

Moving to Domain 4, the key is that the three pillars of **observability** — logs, metrics, and traces — each answer a different question.

| Pillar | Question answered | Data form | AWS tools |
|------|------|------|------|
| Metrics | "What, and how much?" (aggregate numbers) | Time-series numbers | CloudWatch Metrics, Managed Prometheus |
| Logs | "What exactly happened?" (individual events) | Timestamped text | CloudWatch Logs, OpenSearch |
| Traces | "Where and why is it slow?" (request path) | Distributed spans | X-Ray, ADOT |

> The term "observability" comes from **control theory**. Observability, as defined by Rudolf Kálmán in 1960, is "the degree to which **the internal state of a system can be inferred from its external outputs alone**." Translated into software, a system is observable if you can infer "what is happening inside the system right now" from the external outputs of logs, metrics, and traces alone. This is where monitoring and observability diverge — **monitoring "answers the questions I defined in advance (dashboards, alarms)"** (known-unknowns), while **observability "can answer questions you did not anticipate, after the fact"** (unknown-unknowns). Why all three pillars are needed: metrics quickly tell you "the error rate has spiked" but not **why** (low-cardinality aggregates); logs hold individual events but cannot thread together which services a request passed through in a distributed system; and traces stitch that request path together and show "at which hop the time leaked." **Correlating** the three — a metric anomaly → the logs for that time → the trace of that request — is the heart of modern observability.

> **X-Ray sampling** is a point that is easy to get confused about on the Pro exam. Tracing every request would blow up cost and overhead, so by its **default sampling rule** X-Ray traces only "1 request per second (reservoir) + 5% of anything beyond that." In high-traffic production, this default can be too little (missing rare errors) or too much, so you adjust with **custom sampling rules** — for example 100% for a specific path (`/checkout`) and 0% for health checks (`/health`). This is an application of **statistical sampling** — instead of a census, estimate the behavior of the population (all requests) from a representative sample, while guaranteeing capture of rare but important events (errors) with separate rules. As a successor and extension of X-Ray there is also **ADOT (AWS Distro for OpenTelemetry)**; OpenTelemetry is a vendor-neutral standard (CNCF), so it can send to multiple backends such as X-Ray, Prometheus, and Jaeger simultaneously. On the exam, a clue of "open-source compatibility, avoid vendor lock-in" means ADOT/OpenTelemetry, and "AWS-native distributed tracing" means X-Ray.

## Log Pipelines and Cost — Why Is Logs Insights Expensive

Logs are the richest pillar but also the most expensive. Understanding the cost structure resolves the exam's "long-term retention / large-scale analysis" patterns.

> ⚠️ **Pitfall**: **CloudWatch Logs Insights is billed per amount of data scanned.** Repeatedly querying several TB of logs interactively racks up cost quickly. So if the clues are "long-term retention + large-scale analysis + low cost," the answer is not permanent retention in Logs but **Subscription Filter → Kinesis Data Firehose → S3 → Athena/Glue**. The key causality: CloudWatch Logs is optimal for "real-time, short-term operational visibility," while S3+Athena is optimal for "low-cost long-term retention + occasional large-scale analysis." A Subscription Filter is a nearly free path that **branches logs to the outside (Firehose, Lambda, OpenSearch) in near real time**, and this branch separates operations (CloudWatch) from analysis/retention (S3, OpenSearch) in a cost-efficient way.

> **EMF (Embedded Metric Format)** is a clever trick that "cuts the cost of metrics and logs at the same time." Normally, to create a custom metric in Lambda you must make a synchronous `PutMetricData` API call, which causes (1) extra latency, (2) API call cost, and (3) explosive cost for high-cardinality metrics (many dimension combinations). EMF **embeds the metric definition in a single structured log line** and sends it to CloudWatch Logs, and CloudWatch **automatically extracts the metric** from that log. In other words, writing the log gets you the metric for free — the synchronous `PutMetricData` call disappears (latency and cost go down), and high-dimensional metrics are efficient because they are log-based. On the exam, "high-cardinality custom metrics from Lambda in a cost- and performance-efficient way" is EMF.

> Since 2019, several SaaS companies have publicly complained about the "observability cost explosion" — as microservices multiply, log, metric, and trace data grows exponentially, and in some organizations the cost of observability tools approached the cost of production infrastructure itself. This phenomenon made cost-optimization patterns like EMF, sampling, and log tiering (hot=CloudWatch, cold=S3) standard. This is the background to why the DOP exam often attaches the qualifier "cost-effective" to observability questions — a simple "collect everything and put it in OpenSearch" is almost always a cost-trap wrong answer, and the layered answer — "operations in CloudWatch, long-term/large-volume in S3+Athena, metrics via EMF" — is the correct one.

## Multi-Account Observability — Signals Scattered, Seen in One Place

If the metrics, logs, and traces of 50 accounts are scattered across each account, you cannot see the whole picture during a failure. **CloudWatch Cross-Account Observability (OAM, Observability Access Manager)** solves this.

> OAM is a one-way trust model of a **Sink (the monitoring account) and Links (the source accounts)**. You create a Sink in a central monitoring account, and each source account sets up a Link to that Sink; the monitoring account then sees the Metrics, Logs, and X-Ray Traces of all source accounts at a glance, **read-only** (the data is not copied or moved; cross-account read permission is delegated). This is **the observability version of the "centralized aggregation" pattern**, like the Tooling-account Hub-Spoke seen in Domain 1 and the Security Hub Delegated Admin of Domain 6. On the exam, a clue of "consolidate metrics from multiple accounts into a single dashboard" makes OAM the answer, and options that scrape metrics with Lambda (operational burden) or solve it with Grafana alone (building authentication and aggregation yourself) are anti-patterns.

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
        ├─ DNS/GA endpoint switch
        └─ SNS/Incident Manager notification
```

> 🎯 **Scenario**: "A global e-commerce company operates in ap-northeast-2 (primary) and us-east-1 (DR). Requirements: ① the SQL DB needs RTO 1 minute and RPO of a few seconds ② the shopping cart (key-value) must be handled in both Regions simultaneously ③ clients allowlist the IP so it cannot change, and failover must take 1 second ④ observability of 40 accounts in a single dashboard ⑤ the failover procedure must not depend on a primary Region failure." → ① **Aurora Global Database** (secondary promote). ② **DynamoDB Global Tables** (aware of the LWW limit). ③ **Global Accelerator** (static Anycast IP, bypasses DNS TTL). ④ **CloudWatch OAM** (Sink/Link). ⑤ Run the failover automation (Route 53/GA Health Check + EventBridge + Step Functions) **in the DR Region** — the lesson of the 2021 us-east-1 outage. The five clues span Domains 3, 3, 3, 4, 3.

## Summary

Today we bound the 30% of Domains 3+4 into five threads. First, **RTO (time axis) and RPO (data axis) are separate**, the CAP theorem forces a trade between RPO=0 and availability, and Aurora Global's "RPO under 1 second" is an asynchronous-replication compromise. Second, **the four DR strategies are four points on a cold↔hot spectrum**, with cost and RTO/RPO inversely proportional, and the clue-by-clue mapping (lowest cost / core only / minutes / RTO 0) gives an instant answer. Third, **Route 53 (DNS, TTL limit) and Global Accelerator (Anycast, static IP, 1 second) operate at different layers**, and the LWW of DynamoDB Global Tables and the read-only Aurora secondary are the pitfalls. Fourth, **FIS proves resilience through chaos engineering** and has a different role from Synthetics/Inspector. Fifth, **observability is the correlation of the three pillars of logs, metrics, and traces**, and X-Ray sampling, EMF, Logs Insights cost, Subscription Filter branching, and OAM central aggregation are the keys to cost-efficient observability — and, as the 2021 us-east-1 lesson shows, failover automation must be driven from the DR Region.

In the next post, we thread Domain 5 (incident response) and Domain 6 (security/compliance) again through the lens of control theory and automated response.

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
