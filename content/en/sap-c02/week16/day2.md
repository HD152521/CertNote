# Day 2 - Domain 2 Review: Designing New Solutions (29%) — The History of Compute, the CS Theory of Data Consistency, and the Internals of Event Architecture

SAP-C02 Domain 2, "Design Solutions for New Solutions," carries the largest exam weight at 29%. The essence of this domain is to go beyond the SAA-level "design that works" and ask for **a design that optimizes the five axes of availability, performance, security, cost, and operations at the same time**. For the same problem, three or four options that all look like the right answer are laid out, and you must pick "the one option that has the lowest operational burden and meets the requirements exactly."

Today we organize Domain 2 along four axes — compute, data, events, and availability — and break down the **historical background, internal operating principles, CS theory, and real-world incidents** behind each choice. Going beyond memorizing a simple mapping table, if you understand "why this service is shaped this way," you can solve variant scenarios you have never seen before.

## Compute — The History of the Abstraction Ladder

The history of AWS compute is **a history of climbing the abstraction ladder one rung at a time**. It started with EC2 (virtual machines) in 2006 and evolved to Lambda (functions) in 2014 and Fargate (serverless containers) in 2017. Each step reduced "the surface area the customer has to manage" — with EC2 you handle the OS, patching, and scaling yourself, with Fargate you only care about containers, and with Lambda you only care about code.

```
Serverless possible? Yes → Lambda (events, short tasks) / Fargate (containers, long-running)
   │ No
Container orchestration? Yes → ECS (simple, AWS-native) / EKS (K8s standard, multi-cloud)
   │ No
EC2 → ASG · Placement Group · Spot · Graviton
```

A Lambda cold start is a direct manifestation of **container initialization cost**. When there are no invocations, AWS reclaims the execution environment (a Firecracker microVM), and on a new invocation it has to boot the microVM, load the runtime, and run the code init all over again (tens to hundreds of ms). Firecracker (2018, written in Rust) is a lightweight virtualization technology built by AWS that boots a microVM in about 125 ms, filling the gap between the weak isolation of containers and the heaviness of VMs. Provisioned Concurrency pre-warms microVMs, and SnapStart (Java) reduces cold starts by restoring a memory snapshot of an already-initialized environment. On the exam, "eliminate Lambda latency variability + predictable traffic" is answered directly by Provisioned Concurrency, and "Java cold start" by SnapStart.

The choice between ECS and EKS is a trade-off of **"standards lock-in vs. operational simplicity."** EKS provides the Kubernetes API standard and therefore multi-cloud portability (you can move to GKE or AKS), but it carries the control plane cost ($0.10/h) and the operational complexity of K8s itself (CNI, RBAC, Helm). ECS is AWS's proprietary orchestrator with a gentler learning curve and no control plane charge, but it ties you to AWS. Pro exam signals: "existing K8s expertise, consistency with on-premises K8s" points to EKS, while "AWS only, simplicity first, small team" points to ECS. For both, you can choose Fargate (serverless) or EC2 (fine-grained control, GPU, Spot) as the data plane.

> ⚠️ **Pitfall**: Lambda is not a silver bullet. It has hard limits: **15-minute execution limit, 10 GB memory cap, 10 GB /tmp, and a payload of 6 MB (synchronous) / 256 KB (asynchronous)**. If you see "long-running batch, large-scale processing, state retention," the answer is not Lambda but Fargate, Batch, or Step Functions. Also, when Lambda connects to RDS through an ENI inside a VPC, it consumes ENIs in proportion to concurrency, so high concurrency plus a VPC Lambda leads to ENI/IP exhaustion (mitigated by Hyperplane ENIs, but connection pooling with RDS Proxy is the standard remedy). For "Lambda + RDS connection explosion," RDS Proxy is the answer.

## Data — Consistency Models and the CAP Theorem

Database selection is an important decision in SAP-C02. The key is to go beyond "relational or not" and read **consistency, scalability, and access patterns**.

| Requirement | DB | Key differentiator |
|-------------|-----|--------------------|
| Standard RDB | RDS | Multi-AZ synchronous replication, 6 engines |
| RDB scale-out, global DR | Aurora / Aurora Global | Decoupled storage, 6-way replication, RPO<1s |
| Serverless RDB | Aurora Serverless v2 | Per-second scaling in ACU units |
| Key-Value, ultra-high TPS | DynamoDB | Unlimited horizontal scaling, single-digit ms |
| Document (Mongo-compatible) | DocumentDB | MongoDB API |
| Graph | Neptune | Gremlin, SPARQL, relationship traversal |
| Time series | Timestream | IoT, metrics, automatic tiering |
| Ledger (immutable) | QLDB | Cryptographically verifiable history |
| Cassandra-compatible | Keyspaces | Serverless Cassandra |
| Redis-compatible + durable | MemoryDB | Multi-AZ durability |
| Search, logs | OpenSearch | Inverted-index full-text search |
| Data warehouse | Redshift | Columnar MPP |

The theoretical backbone for choosing a distributed DB is the **CAP theorem (Brewer, 2000; formally proven by Gilbert and Lynch in 2002)**. When a network partition (P) occurs, you must give up either consistency (C) or availability (A). DynamoDB is **AP** by default (availability first, eventual consistency), but you can opt into strong consistency with `ConsistentRead=true`. A more precise model is **PACELC (Abadi, 2012)** — during a partition (P) you choose A or C, and Else (during normal operation) you choose latency (L) or consistency (C). DynamoDB leans PA/EL (relaxing consistency to minimize latency in normal operation), while Aurora leans PC/EC (consistency first). On the exam, "global writes + low latency + eventual consistency OK" points to DynamoDB Global Tables (AP/EL), while "strong consistency + transactions" points to Aurora.

Aurora's innovation is its **"the log is the database"** architecture (2017 SIGMOD paper). A traditional RDBMS replicates both data pages and the redo log over the network, causing heavy I/O amplification. Aurora sends only redo log records to six storage nodes (3 AZs × 2), and the storage layer reconstructs pages in the background. A write commits when **4 of 6 (a 4/6 quorum)** acknowledge, and reads can be served with a 3/6 quorum — this quorum math (W+R>N, 4+3>6) guarantees writes even if an entire AZ dies, and reads even if an AZ plus one more node dies. Because compute and storage are separated, Read Replicas share the same storage (near-zero replication lag) and can be added quickly.

The 2012 **Knight Capital** loss of $440 million (in 45 minutes) is a textbook case of failed data and deployment design. New trading code was deployed to only 7 of 8 servers, and the 1 remaining server still held old code that reused an old flag, so that one server spewed out a runaway flood of orders. The lessons are (1) **no partial deployments — use immutable infrastructure and Blue/Green**, (2) **a kill switch (Stop Condition)**, and (3) **do not hide state in code**. This is the historical reason Pro pushes CodeDeploy Blue/Green and FIS Stop Condition as the answers for "deployment safety + instant rollback."

> ⚠️ **Pitfall**: A DynamoDB **hot partition** is a common trap. If the partition key has low cardinality (for example `status=active`), writes concentrate on one partition and get throttled. Even with On-Demand or ample RCU/WCU, you are throttled once you exceed the single-partition limit (3000 RCU / 1000 WCU). The fix is **a high-cardinality partition key design + write sharding (adding a suffix to the key)**. If you see "only some DynamoDB keys are throttled," the answer is key design, not adding capacity.

## Events and Messaging — Tools That Lower Coupling

Event-driven architecture is a design that **breaks temporal and spatial coupling**. A synchronous call makes the caller wait for the response (temporal coupling) and requires it to know the target's address (spatial coupling). Queues, topics, and buses break both, so that if one side dies the other side survives.

| Service | Model | Ordering | Key internals |
|---------|-------|----------|---------------|
| **SQS Standard** | Queue (point-to-point) | Unordered | At-Least-Once, unlimited throughput |
| **SQS FIFO** | Queue | Ordered per MessageGroupId | Exactly-Once, 300 TPS (3000 with batching) |
| **SNS** | Pub/Sub fan-out | FIFO option | Simultaneous delivery to many subscribers |
| **EventBridge** | Event bus, routing | Unordered | Rule-based filtering and transformation, SaaS sources |
| **Kinesis Data Streams** | Stream | Ordered within a shard | Retention (1 to 365 days), multi-consumer replay |
| **MSK** | Kafka | Ordered within a partition | Open-source Kafka compatible |
| **Step Functions** | Workflow | Explicit ordering | State machine, visual |

SQS's "At-Least-Once + unordered" is not accidental but a **fundamental limit of distributed systems**. Exactly-once delivery is generally close to impossible in a distributed environment (networks allow message loss and duplication), so most systems work around it with "at-least-once delivery + an idempotent consumer." SQS Standard reduces duplicate processing by hiding a message for the visibility timeout, but if the consumer fails to delete it within the timeout, it is redelivered. That is why consumers must be designed to be **idempotent** (processing the same message twice yields the same result). FIFO mimics exactly-once through deduplication but sacrifices throughput. On the exam, "exactly once + strict ordering" is FIFO, and "very high throughput + idempotent consumption possible" is Standard.

The essential difference between Kinesis and SQS is **"delete after consumption vs. retain and replay."** SQS deletes a message once a consumer processes it, giving a single-consumer model, while Kinesis retains messages in shards (24h by default, up to 365 days) so multiple consumers can independently consume and replay the same data with their own checkpoints. This is why "multiple consumers + reprocessing + ordering guarantee" means Kinesis. A shard has write limits of 1 MB/s or 1000 records/s and a read limit of 2 MB/s, so to increase throughput you add shards (re-sharding). Enhanced Fan-Out gives each consumer a dedicated 2 MB/s and eliminates contention among multiple consumers. "Multiple consumers + message replay" is Kinesis (C), and "simple work distribution" is SQS.

> 🎯 **Scenario**: "In e-commerce, one order must trigger four services: payment, inventory, shipping, and notification. Even if one downstream service has a temporary failure, the other services must not be affected, and the failed service must process everything without loss after it recovers. What is the design?" — Answer: **SNS (order topic) → fan-out to 4 SQS queues, each service consuming its own queue**. SNS fans out to the 4 queues simultaneously, and each queue acts as a buffer, so if one service dies its messages pile up in its queue and are processed after recovery (the other queues are unaffected). A DLQ isolates messages that fail repeatedly. Invoking Lambda directly from SNS has no buffer during failures, so the risk of lost messages is high. This "SNS → multiple SQS fan-out" is the standard pattern for breaking coupling.

## Availability — The Ladder of Isolation Boundaries

Availability design is a matter of **where you place the boundary that isolates failures**. AWS provides a ladder of AZ → Region → Account. Cost and complexity grow as you go up, so choose the smallest boundary that fits the required RTO/RPO.

| Boundary | What it isolates | Representative patterns |
|----------|------------------|-------------------------|
| Multi-AZ | Data center failure | RDS Multi-AZ, ASG across AZs |
| Multi-Region | Whole-region failure, disaster | Aurora Global, DDB Global Tables, Route 53 Failover |
| Multi-Account | Compromise, blast radius | Organizations, workload isolation |

The December 2021 **US-EAST-1 major outage** exposed the danger of depending on a single region. An internal network automation bug paralyzed the us-east-1 API for several hours, and because global services (IAM, some consoles) depended on us-east-1, even users in other regions were affected. The lessons are (1) **single-region, single-AZ designs cannot meet the SLA**, (2) **reduce dependencies on us-east-1** (use global endpoints and STS regional endpoints), and (3) **the DR region must be in a verified state, receiving some traffic even in normal times** (a cold standby is likely to fail when you actually fail over). On the exam, "survive a region failure + RTO in minutes" is the signal for Active-Active or Warm Standby.

Caching is a lever that improves availability, performance, and cost at the same time. **CloudFront** (edge CDN) caches static and dynamic content at edges near users to reduce origin load and latency, **ElastiCache** (Redis/Memcached) absorbs reads as an in-memory cache in front of the DB, and **DAX** is a microsecond cache dedicated to DynamoDB. The pitfall of caching is **cache invalidation** — as the joke about "one of the two hard problems in computer science" goes, it is the problem of updated data remaining stale in the cache. You handle it with TTLs, write-through, and event-based invalidation. "Protect a read-heavy DB + microsecond latency + DynamoDB" is DAX, and "general-purpose DB read cache" is ElastiCache.

## Scenario Keyword → Answer Mapping

| Keyword | Answer | One-line rationale |
|---------|--------|--------------------|
| "Minimal operational burden, events, short tasks" | Lambda | Function-level, zero idle cost |
| "Serverless containers, long-running" | Fargate | No 15-minute limit |
| "Eliminate Lambda latency variability" | Provisioned Concurrency | Pre-warmed microVMs |
| "Lambda + RDS connection explosion" | RDS Proxy | Connection pooling |
| "Long-running, complex workflow, error handling" | Step Functions | State machine |
| "Events from multiple sources → multiple targets, filtering" | EventBridge | Rule-based routing |
| "Multiple consumers + reprocessing + ordering" | Kinesis Data Streams | Retention, replay, per-shard ordering |
| "Exactly once + strict ordering" | SQS FIFO | Dedup, MessageGroupId |
| "One service's failure must not affect others" | SNS → multiple SQS fan-out | Queue buffer isolation |
| "Global SQL, RPO<1s" | Aurora Global Database | Asynchronous storage replication |
| "Global two-way writes, NoSQL" | DynamoDB Global Tables | Multi-Region Active-Active |
| "RDB with zero cost at zero traffic" | Aurora Serverless v2 | ACU per-second scaling |
| "Hundreds of thousands of TPS Key-Value, single-digit ms" | DynamoDB On-Demand | Unlimited horizontal scaling |
| "Only some DynamoDB keys are throttled" | Redesign the partition key, write sharding | Hot partition |
| "Real-time search, log analytics" | OpenSearch | Inverted index |
| "Immutable, auditable ledger" | QLDB | Cryptographically verifiable history |
| "DynamoDB microsecond read cache" | DAX | Dedicated in-memory cache |

## Summary

The essence of Domain 2 is **simultaneous optimization of the five axes (availability, performance, security, cost, operations)**. Key insights: (1) compute is an abstraction ladder — pick the most managed option that meets the requirements, (2) for data, read consistency vs. availability and latency through CAP/PACELC — global + eventual consistency is DynamoDB, strong consistency + transactions is Aurora, (3) events are tools that break coupling — at-least-once with idempotent consumption is the default, multiple consumers and replay point to Kinesis, and isolated fan-out is SNS → SQS, (4) availability is a ladder of isolation boundaries — the smallest boundary that fits the required RTO/RPO. When several options still look right, choose **the one with the lower operational burden that meets the requirements exactly**.

Tomorrow (Day 78) we will go deep on Domain 3, migration and modernization, through the 7R decision tree and the internals of the tools.

---

## 📝 Practice Questions

**Question 1.** "Minimize cost" + "30 min RTO requirement" → **Pilot Light (not Backup), not Multi-Site**

**Question 2.** "No downtime + global" → **Multi-Site Active-Active + time zone compliance**

**Question 3.** "Regulatory 7 years + change immutable" → **Object Lock Compliance, not Governance**

**Question 4.** "Time constraint + data transformation" → **Rehost+optimize vs Refactor-all-upfront**

**Question 5.** Hidden constraint "EU data outside EU" → **SCP DenyRegions (root blocker)**

**Question 6.** Recognizing **PACELC trade-off** behind "RPO 1s multi-region" → **Async replication, not sync**

---

**Question 7.** A startup generates thumbnails when images are uploaded. Traffic is concentrated for only a few hours a day and is near zero the rest of the time. It wants to minimize operational burden and idle cost. Which compute option is most appropriate?
A) A processing daemon running permanently on an EC2 ASG
B) S3 event, then Lambda thumbnail generation
C) A Fargate always-on service
D) A permanently running EC2 Spot fleet

**Answer: B**

Explanation: "Event trigger + short task (thumbnail generation) + zero cost when idle + minimal operational burden" is exactly Lambda's domain. An S3 PutObject event invokes Lambda, and with no invocations the charge is 0 (no resident server). A, C, and D all keep instances running even when there is no traffic, which creates idle cost, and they carry the operational burden of OS and scaling. C (Fargate) is serverless, but running it as an always-on service creates idle charges, and Lambda is more suitable for short event-driven tasks. Trap: "Fargate is also serverless," but for event-driven, one-off tasks Lambda is the direct answer.

---

**Question 8.** A global game reads and writes player profiles from Regions around the world. Each Region should read and write with local latency (single-digit ms), and it is fine if changes from other Regions are reflected eventually (strong consistency is not required). Which design is most appropriate?
A) Single-Region Aurora + global Read Replicas
B) DynamoDB Global Tables
C) Aurora Global Database
D) Independent RDS per Region + nightly batch synchronization

**Answer: B**

Explanation: "Local writes in every Region (active-active) + low latency + eventual consistency allowed" is exactly the use case for DynamoDB Global Tables. Each Region writes directly to its local replica, and changes propagate to all Regions in the background (conflicts are resolved by last-writer-wins). In PACELC terms it is PA/EL: it relaxes consistency for latency during normal operation. A and C (Aurora Global) allow writes in **only a single Region** and the other Regions are read-only, so they cannot meet the "local writes in each Region" requirement (writes always have to go to the primary Region, which adds latency). D has no real-time behavior and conflict resolution is manual. Trap: "local writes in each Region + eventual OK" is DynamoDB Global Tables, not Aurora Global.

---

**Question 9.** An order processing system triggers 4 microservices: payment, inventory, shipping, and notification. Even if one service has a temporary failure, the others must keep processing normally, and the failed service must process the backlog of messages without loss after it recovers. Which pattern is most appropriate?
A) The order service calls the 4 services with synchronous HTTP
B) SNS order topic fanning out to 4 SQS queues, with each service consuming its own queue
C) A single SQS queue consumed by all 4 services in a shared manner
D) EventBridge rules invoking the 4 Lambda functions directly

**Answer: B**

Explanation: "A failure in one service has no effect on the others + loss-free processing after recovery" is the textbook case for **SNS fan-out + a dedicated SQS queue per service**. SNS replicates to the 4 queues at the same time, and each queue becomes an independent buffer, so even if one service dies, messages pile up only in that queue and are consumed after recovery (the other queues and services are unaffected). A DLQ isolates repeated failures. A (synchronous calls) is temporal coupling in which one service's failure blocks everything. C (a single shared queue) lets only one consumer take each message, so the 4 services cannot all receive the same message (no fan-out). D (EventBridge to Lambda directly) has no queue buffer, so there are limits on loss and retries when a downstream service fails. Trap: "fan-out + isolated buffer per service" is SNS to multiple SQS.

---

**Question 10.** Several analytics teams consume IoT sensor data independently, and one team must reprocess (replay) data from 7 days ago. The data must preserve per-device time order. Which service is most appropriate?
A) SQS Standard
B) SNS
C) Kinesis Data Streams
D) EventBridge Bus

**Answer: C**

Explanation: "Multiple independent consumers + reprocessing of past data (replay) + ordering guarantee" is the core differentiator of Kinesis Data Streams. Kinesis retains data in shards (up to 365 days), so multiple consumers can independently consume the same stream with their own checkpoints and rewind to a past point to reprocess. A per-device partition key guarantees order within a shard. A (SQS) deletes messages after consumption, so reprocessing and multiple independent consumption are not possible. B (SNS) supports fan-out but cannot retain or replay messages. D (EventBridge) is centered on routing and filtering, and although it has Archive/Replay, Kinesis is the better fit for high-throughput ordered streaming and the multi-consumer checkpoint model. Trap: "replay + multiple consumers + ordering" is Kinesis.

---

**Question 11.** A SaaS back-office RDB has traffic only during business hours and almost none at night and on weekends. The company wants cost proportional to usage and automatic scaling when traffic surges. Which database is most appropriate?
A) RDS MySQL Multi-AZ (fixed instance)
B) Aurora Serverless v2
C) DynamoDB On-Demand
D) Redshift

**Answer: B**

Explanation: "Load only during business hours + cost proportional to usage + automatic scaling + relational" is exactly the use case for Aurora Serverless v2. It scales per second in ACU (Aurora Capacity Unit) units, lowering ACUs to cut cost when load is low and scaling immediately on surges (unlike v1, v2 does not stop completely at 0, but it lowers the minimum ACU to 0.5). A (fixed instance) costs the full amount at night and on weekends too. C (DynamoDB) is NoSQL and may be unsuitable for relational workloads (joins, complex queries). D (Redshift) is an analytics warehouse and unsuitable for an OLTP back office. Trap: "relational + proportional to usage + automatic scaling" is Aurora Serverless v2.

---

**Question 12.** A high-concurrency Lambda function connecting to RDS PostgreSQL gets "too many connections" errors. When Lambda concurrency grows, DB connections surge. What is the solution with minimal change?
A) Scale up the RDS instance size
B) Introduce RDS Proxy
C) Set Lambda concurrency to unlimited
D) Migrate to Aurora

**Answer: B**

Explanation: Lambda opens a DB connection from an independent execution environment for each concurrent execution, so when concurrency grows, connections surge and exceed RDS max_connections. **RDS Proxy** maintains and reuses a connection pool between Lambda and the DB so that many Lambda invocations share a small number of DB connections, solving connection exhaustion with minimal code changes. A (scaling up the instance) raises max_connections but is not a root fix and only increases cost. C (unlimited concurrency) makes the problem worse. D (migrating to Aurora) is an excessive change and does not by itself provide connection pooling (Aurora also recommends RDS Proxy). Trap: "Lambda + DB connection explosion" is RDS Proxy.

---

**Question 13.** A global SQL database must recover in another Region within an RPO of under 1 second and an RTO of 1 minute if the primary Region fails. During normal operation, the secondary Region shares the read load. Which design is most appropriate?
A) RDS Multi-AZ
B) Aurora Global Database
C) DynamoDB Global Tables
D) Cross-Region Read Replica with manual promotion

**Answer: B**

Explanation: "Global SQL + RPO under 1s + RTO in minutes + secondary Region shares reads" is exactly the use case for Aurora Global Database. With storage-layer asynchronous replication it typically achieves an RPO of under 1 second, and the secondary Region shares load as a read-only replica and is promoted within 1 minute during a disaster. A (Multi-AZ) withstands only an AZ failure within a single Region and is powerless against a Region failure. C is NoSQL and does not fit the "SQL" requirement. D (a Read Replica with manual promotion) has large replication lag and a manual, slow promotion that cannot meet the RTO (Aurora Global uses dedicated replication infrastructure and is much faster). Trap: "global SQL + RPO in seconds + fast promotion" is Aurora Global Database.

---