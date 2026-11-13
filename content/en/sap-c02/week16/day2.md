# Day 2 - Domain 2 Wrap-Up: Design for New Solutions (29%) - The History of Compute, CS Theory of Data Consistency, and the Internals of Event Architecture

SAP-C02 Domain 2, "Design Solutions for New Solutions," has the largest exam weight at 29%. The essence of this domain is to ask for a **design that optimizes the 5 axes of availability, performance, security, cost, and operations at the same time**, going beyond SAA's "working design." The same question lays out 3-4 choices that all look like the answer, and you must pick "the single one with the lowest operational burden that accurately meets the requirements."

Today we organize Domain 2 into four axes - compute, data, events, and availability - and deeply break down each choice's **historical background, internal working principles, CS theory, and real incident cases**. If you go beyond memorizing mapping tables and understand "why this service has this shape," you can solve variant scenarios you've never seen.

## Compute - The History of the Abstraction Ladder

The history of AWS compute is **a history of climbing the abstraction ladder one rung at a time**. It started in 2006 with EC2 (virtual machines) and evolved to Lambda (functions) in 2014 and Fargate (serverless containers) in 2017. Each stage reduced the "surface area the customer must manage" - with EC2 you handle the OS, patching, and scaling yourself, with Fargate only the container, and with Lambda only the code.

```
Serverless possible? Yes → Lambda (events, short tasks) / Fargate (containers, long-running)
   │ No
Container orchestration? Yes → ECS (simple AWS) / EKS (K8s standard, multi-cloud)
   │ No
EC2 → ASG · Placement Group · Spot · Graviton
```

Lambda's cold start is a direct manifestation of **container initialization cost**. When there are no invocations, AWS reclaims the execution environment (a Firecracker microVM), and on a new invocation it redoes microVM boot + runtime load + code init (tens to hundreds of ms). Firecracker (2018, written in Rust) is a lightweight virtualization technology built by AWS that boots a microVM in ~125ms, bridging the gap between containers' lack of isolation and VMs' heaviness. Provisioned Concurrency pre-warms microVMs, and SnapStart (Java) restores an initialized memory snapshot to reduce cold starts. On the exam, "eliminate Lambda latency variability + predictable traffic" is Provisioned Concurrency, and "Java cold start" is SnapStart as the direct answer.

Choosing ECS vs EKS is a trade-off of **"standard lock-in vs operational simplicity."** EKS provides the Kubernetes API standard and gives multi-cloud portability (you can move to GKE or AKS), but it carries the control plane cost ($0.10/h) and K8s's own operational complexity (CNI, RBAC, Helm). ECS is AWS's proprietary orchestrator with a gentler learning curve and no cost, but it ties you to AWS. Pro exam signals: "existing K8s expertise, consistency with on-prem K8s" means EKS, and "AWS-only, simplicity first, small team" means ECS. For both, you can choose the data plane as Fargate (serverless) or EC2 (fine-grained control, GPU, Spot).

> ⚠️ **Pitfall**: Lambda is not a cure-all. It has hard limits of **15-minute execution, 10GB memory cap, 10GB /tmp, 6MB payload (synchronous)/256KB (asynchronous)**. If you see "long-running batch, large-volume processing, state retention," the answer is Fargate, Batch, or Step Functions, not Lambda. Also, when Lambda connects to RDS through an ENI inside a VPC, it consumes ENIs in proportion to concurrency, so high concurrency + VPC Lambda leads to ENI/IP exhaustion (mitigated by Hyperplane ENIs, but connection pooling with RDS Proxy is the standard). "Lambda + RDS connection explosion" has RDS Proxy as the answer.

## Data - Consistency Models and the CAP Theorem

Choosing a database is an important decision in SAP-C02. The key is to read **consistency, scalability, and access patterns**, going beyond "relational or not."

| Requirement | DB | Key differentiator |
|------|-----|------------|
| Standard RDB | RDS | Multi-AZ synchronous replication, 6 engines |
| RDB scale-out, global DR | Aurora / Aurora Global | Separated storage, 6-way replication, RPO<1s |
| Serverless RDB | Aurora Serverless v2 | Fine-grained scaling in ACU units |
| Key-Value ultra-high TPS | DynamoDB | Unlimited horizontal scaling, single-digit ms |
| Document (Mongo-compatible) | DocumentDB | MongoDB API |
| Graph | Neptune | Gremlin, SPARQL, relationship traversal |
| Time series | Timestream | IoT, metrics, automatic tiering |
| Ledger (immutable) | QLDB | Cryptographically verifiable history |
| Cassandra-compatible | Keyspaces | Serverless Cassandra |
| Redis-compatible + durable | MemoryDB | Multi-AZ durability |
| Search, logs | OpenSearch | Inverted-index full-text |
| Data warehouse | Redshift | Columnar MPP |

The theoretical backbone of distributed DB selection is the **CAP theorem (Brewer, 2000; formally proven by Gilbert and Lynch in 2002)**. When a network partition (Partition) occurs, you must give up either consistency (Consistency) or availability (Availability). DynamoDB is by default **AP** (availability first, eventual consistency), but you can choose strong consistency with `ConsistentRead=true`. A more precise model is **PACELC (Abadi, 2012)** - during a partition (P) you choose A/C, and else, in normal operation (Else), you choose latency (L)/consistency (C). DynamoDB leans PA/EL (relaxing consistency to minimize latency in normal operation), and Aurora leans PC/EC (consistency first). On the exam, "global writes + low latency + eventual is OK" splits to DynamoDB Global Tables (AP/EL), and "strong consistency + transactions" to Aurora.

Aurora's innovation is the **"the log is the database"** architecture (2017 SIGMOD paper). Traditional RDBMSs replicated both data pages and redo logs over the network, causing heavy I/O amplification. Aurora sends only redo log records to 6 storage nodes (3 AZs x 2), and the storage layer reconstructs pages in the background. Writes commit on responses from **4 of the 6 (4/6 quorum)**, and reads are possible with a 3/6 quorum - this quorum math (W+R>N, 4+3>6) guarantees writes even if a whole AZ dies, and reads even if one AZ plus one node dies. That's why Aurora separates compute from storage, so Read Replicas share the same storage (replication lag near 0) and can be added quickly.

**Knight Capital**'s $440 million loss (in 45 minutes) in 2012 is a textbook data and deployment design failure. New trading code was deployed to only 7 of 8 servers, and code reusing an old flag remained on 1 server, which spewed out runaway orders. The lessons are (1) **immutable infrastructure and Blue/Green - no partial deployments**, (2) **a kill switch (Stop Condition)**, and (3) **don't hide state in code**. This is the historical reason why Pro pushes CodeDeploy Blue/Green and FIS Stop Condition as answers for "deployment safety + immediate rollback."

> ⚠️ **Pitfall**: DynamoDB **hot partitions** are a common trap. If partition key cardinality is low (e.g., `status=active`), writes concentrate on one partition and get throttled. Even with On-Demand or sufficient RCU/WCU, exceeding the single-partition limit (3000 RCU/1000 WCU) causes throttling. The fix is **high-cardinality partition key design + write sharding (suffix on the key)**. If you see "only some DynamoDB keys are throttled," the answer is key design, not capacity increase.

## Events and Messaging - Tools That Lower Coupling

Event-driven architecture is a design that **breaks temporal and spatial coupling**. A synchronous call makes the caller wait for the response (temporal coupling) and requires knowing the target's address (spatial coupling). Queues, topics, and buses break both so that if one side dies, the other lives.

| Service | Model | Ordering | Key internal behavior |
|--------|------|------|---------------|
| **SQS Standard** | Queue (point-to-point) | Unordered | At-Least-Once, unlimited throughput |
| **SQS FIFO** | Queue | Ordered per MessageGroupId | Exactly-Once, 300 TPS (3000 with batching) |
| **SNS** | Pub/Sub fan-out | FIFO option | Simultaneous delivery to many subscribers |
| **EventBridge** | Event bus, routing | Unordered | Rule-based filtering/transformation, SaaS sources |
| **Kinesis Data Streams** | Stream | Ordered within a shard | Retention (1-365 days), multi-consumer replay |
| **MSK** | Kafka | Ordered within a partition | Open-source Kafka compatible |
| **Step Functions** | Workflow | Explicit order | State machine, visual |

SQS's "At-Least-Once + unordered" is not a coincidence but a **fundamental limit of distributed systems**. Exactly-once delivery is generally close to impossible in a distributed environment (networks permit message loss and duplication), so most systems work around it with "at-least-once delivery + idempotent consumers." SQS Standard hides a message during the visibility timeout to reduce duplicate processing, but if the consumer fails to delete it within the timeout, it is redelivered. That's why consumers must be designed to be **idempotent** (processing the same message twice gives the same result). FIFO imitates exactly-once through dedup but sacrifices throughput. On the exam, "exactly once, strict ordering" is FIFO, and "very high throughput, idempotent consumption possible" is Standard.

The essential difference between Kinesis and SQS is **"delete after consumption vs retain and replay."** SQS deletes a message once a consumer processes it, a single-consumer model, while Kinesis retains messages in shards (24h by default, up to 365 days) so multiple consumers can independently consume and replay the same data with their own checkpoints. This is why "multiple consumers + reprocessing + ordering guarantee" means Kinesis. A shard has limits of 1MB/s or 1000 rec/s for writes and 2MB/s for reads, so to increase throughput you add shards (re-sharding). Enhanced Fan-Out gives each consumer a dedicated 2MB/s, eliminating multi-consumer contention. "Multiple consumers + message replay" is Kinesis (C), and "simple task distribution" is SQS.

> 🎯 **Scenario**: "In e-commerce, a single order must trigger 4 services: payment, inventory, shipping, and notification. Even if one downstream has a temporary failure, the other services must not be affected, and the failed service must process everything without omissions after recovery. What is the design?" - Answer: **SNS (order topic) → fan-out to 4 SQS queues, each service consuming its own queue**. SNS fans out to the 4 queues simultaneously, and each queue acts as a buffer so that if one service dies, messages accumulate in that queue and are processed after recovery (other queues are unaffected). A DLQ isolates repeatedly failing messages. SNS invoking Lambda directly has no buffer during a failure, so the risk of loss is large. This "SNS → multiple SQS fan-out" is the canonical pattern for breaking coupling.

## Availability - The Ladder of Isolation Boundaries

Availability design is a question of **where to put the boundaries that isolate failures**. AWS provides a ladder of AZ → Region → Account. Cost and complexity grow as you go up, so choose the minimum boundary that fits the required RTO/RPO.

| Boundary | What it isolates | Representative pattern |
|------|----------|----------|
| Multi-AZ | Data center failure | RDS Multi-AZ, ASG across multiple AZs |
| Multi-Region | Whole-Region failure, disaster | Aurora Global, DDB Global Tables, Route 53 Failover |
| Multi-Account | Breach, blast radius | Organizations, workload isolation |

The **US-EAST-1 major outage** of December 2021 exposed the risk of depending on a single Region. An internal network automation bug paralyzed the us-east-1 APIs for hours, and because global services (IAM, some consoles) depended on us-east-1, even users in other Regions were affected. The lessons are (1) **single-Region, single-AZ designs cannot meet the SLA**, (2) **reduce us-east-1 dependencies** (use global endpoints and STS Regional endpoints), and (3) **the DR Region must be a validated state that receives some traffic even during normal times** (a cold standby easily fails when the failover actually happens). On the exam, "tolerate Region failure + RTO in minutes" signals Active-Active or Warm Standby as the answer.

Caching is a lever that improves availability, performance, and cost at the same time. **CloudFront** (edge CDN) caches static and dynamic content at edges near users to reduce origin load and latency, **ElastiCache** (Redis/Memcached) absorbs reads as an in-memory cache in front of the DB, and **DAX** is a microsecond cache dedicated to DynamoDB. The pitfall of caching is **cache invalidation** - as the joke about "one of the two hard problems in computer science" goes, it is the problem of updated data remaining stale in the cache. It is handled with TTL, write-through, and event-driven invalidation. "Protect a DB from read surges + microsecond latency + DynamoDB" is DAX, and "general-purpose DB read cache" is ElastiCache.

## Scenario Keyword → Answer Mapping

| Keyword | Answer | One-line rationale |
|--------|-----|-----------|
| "Minimal operations, events, short tasks" | Lambda | Function units, zero idle cost |
| "Serverless containers, long-running" | Fargate | No 15-minute limit |
| "Eliminate Lambda latency variability" | Provisioned Concurrency | microVM pre-warming |
| "Lambda + RDS connection explosion" | RDS Proxy | Connection pooling |
| "Long-running, complex workflow, error handling" | Step Functions | State machine |
| "Events from multiple sources → multiple targets, filtering" | EventBridge | Rule-based routing |
| "Multiple consumers + reprocessing + ordering" | Kinesis Data Streams | Retention, replay, shard ordering |
| "Exactly once + strict ordering" | SQS FIFO | dedup, MessageGroupId |
| "One service's failure must not affect others" | SNS → multiple SQS fan-out | Queue buffer isolation |
| "Global SQL, RPO<1s" | Aurora Global Database | Asynchronous storage replication |
| "Global two-sided writes NoSQL" | DynamoDB Global Tables | Multi-Region Active-Active |
| "RDB with zero cost at zero traffic" | Aurora Serverless v2 | Fine-grained ACU scaling |
| "Hundreds of thousands of TPS Key-Value, single-digit ms" | DynamoDB On-Demand | Unlimited horizontal scaling |
| "Only some DynamoDB keys throttled" | Partition key redesign, write sharding | Hot partition |
| "Real-time search, log analytics" | OpenSearch | Inverted index |
| "Immutable auditable ledger" | QLDB | Cryptographically verified history |
| "DynamoDB microsecond read cache" | DAX | Dedicated in-memory cache |

## Summary

The essence of Domain 2 is **simultaneous optimization of the 5 axes (availability, performance, security, cost, operations)**. Key insights: (1) compute is an abstraction ladder - pick the most managed option that meets the requirements, (2) for data, read consistency vs availability and latency through CAP/PACELC - global + eventual is DynamoDB, strong consistency + transactions is Aurora, (3) events are tools that break coupling - At-Least-Once with idempotent consumption is the default, multiple consumers and replay is Kinesis, isolated fan-out is SNS→SQS, (4) availability is a ladder of isolation boundaries - the minimum boundary that fits the required RTO/RPO. If several choices look like the same answer, pick **the one with the lower operational burden that meets the requirements precisely**.

Tomorrow (Day 78) we go deep on Domain 3, migration and modernization, with the 7R decision tree and the internals of the tools.

---

## 📝 Practice Questions

**Question 1.** A startup generates thumbnails when images are uploaded. Traffic surges for only a few hours a day and is nearly 0 the rest of the time. It wants to minimize operational burden and idle cost. What is the most suitable compute?

A) A processing daemon resident on an EC2 ASG

B) S3 event → Lambda thumbnail generation

C) A Fargate always-on service

D) A resident EC2 Spot fleet

**Answer: B**

Explanation: "Event trigger + short task (thumbnail generation) + zero idle cost + minimal operational burden" is Lambda's domain. The S3 PutObject event invokes Lambda, and with no invocations, billing is 0 (no resident servers). A, C, and D all keep instances running even when there is no traffic, incurring idle cost, and carry the operational burden of OS and scaling. C (Fargate) is serverless, but running it as an always-on service incurs idle billing, and Lambda is more suitable for event-based short tasks. Pitfall: "Fargate is serverless too," but for events and one-off tasks Lambda is the direct answer.

---

**Question 2.** A global game reads and writes player profiles from Regions around the world. Each Region reads and writes with local latency (single-digit ms), and changes from other Regions only need to be reflected eventually (strong consistency not required). What is the most suitable design?

A) Single-Region Aurora + global Read Replicas

B) DynamoDB Global Tables

C) Aurora Global Database

D) Independent RDS per Region + nightly batch sync

**Answer: B**

Explanation: "Local writes in every Region (active-active) + low latency + eventual consistency allowed" is exactly where DynamoDB Global Tables are used. Each Region writes directly to its local replica, and changes propagate to all Regions in the background (last-writer-wins conflict resolution). In PACELC terms it is PA/EL - relaxing consistency for latency in normal operation. A and C (Aurora Global) allow **writes in a single Region only**, and the other Regions are read-only, so they can't meet the "local writes in each Region" requirement (writes must always go to the primary Region, causing latency). D has no real-time behavior and conflict resolution is manual. Pitfall: "local writes in each Region + eventual OK" is DynamoDB Global Tables, not Aurora Global.

---

**Question 3.** An order processing system triggers 4 microservices: payment, inventory, shipping, and notification. Even if one service has a temporary failure, the rest must process normally, and the failed service must process the backlogged messages without omissions after recovery. What is the most suitable pattern?

A) The order service calls the 4 services with synchronous HTTP

B) SNS order topic → fan-out to 4 SQS queues, each service consuming its own queue

C) A single SQS queue shared and consumed by the 4 services

D) Invoke the 4 Lambdas directly with EventBridge rules

**Answer: B**

Explanation: "One service's failure has no impact on others + processing without omissions after recovery" is the canonical **SNS fan-out + a dedicated SQS queue per service**. SNS replicates to the 4 queues at once, and each queue becomes an independent buffer, so if one service dies, messages pile up only in that queue and are consumed after recovery (other queues and services are unaffected). A DLQ isolates repeated failures. A (synchronous calls) is temporal coupling where one service's failure blocks everything. C (sharing a single queue) means only one consumer takes a message, so all 4 services cannot receive the same message (fan-out is impossible). D (EventBridge → Lambda directly) has no queue buffer, so there are limits on loss and retries during downstream failures. Pitfall: "fan-out + isolated buffer per service" is SNS→multiple SQS.

---

**Question 4.** Multiple analytics teams consume IoT sensor data independently, and a particular team must reprocess (replay) data from 7 days ago. The data must preserve per-device time order. What is the most suitable service?

A) SQS Standard

B) SNS

C) Kinesis Data Streams

D) EventBridge Bus

**Answer: C**

Explanation: "Multiple independent consumers + reprocessing past data (replay) + ordering guarantee" is the key differentiator of Kinesis Data Streams. Kinesis retains data in shards (up to 365 days), so multiple consumers independently consume the same stream with their own checkpoints and can rewind to a past point and reprocess. A per-device partition key guarantees ordering within a shard. A (SQS) deletes after consumption, so reprocessing and multiple independent consumption are not possible. B (SNS) does fan-out but cannot retain or replay messages. D (EventBridge) is centered on routing and filtering, and although it has Archive/Replay, Kinesis suits the high-throughput ordered streaming and multi-consumer checkpoint model. Pitfall: "replay + multiple consumers + ordering" is Kinesis.

---

**Question 5.** A SaaS back-office RDB has traffic only during business hours and nearly 0 at night and on weekends. It wants cost proportional to usage and must scale automatically when traffic surges. What is the most suitable DB?

A) RDS MySQL Multi-AZ (fixed instance)

B) Aurora Serverless v2

C) DynamoDB On-Demand

D) Redshift

**Answer: B**

Explanation: "Load only during business hours + cost proportional to usage + automatic scaling + relational" is exactly where Aurora Serverless v2 is used. It scales in fine-grained ACU (Aurora Capacity Unit) increments, reducing ACUs when load is low to save cost and expanding instantly on surges (the minimum ACU can go down to 0.5, and newer versions can go down to 0 ACU through automatic pause). A (fixed instance) incurs full cost at night and on weekends too. C (DynamoDB) is NoSQL, so it may be unsuitable for relational workloads (joins, complex queries). D (Redshift) is an analytics warehouse and unsuitable for an OLTP back office. Pitfall: "relational + cost proportional to usage + automatic scaling" is Aurora Serverless v2.

---

**Question 6.** A high-concurrency Lambda function connecting to RDS PostgreSQL gets "too many connections" errors. As Lambda concurrent executions grow, DB connections surge. What resolves this with minimal changes?

A) Increase the RDS instance size

B) Introduce RDS Proxy

C) Set Lambda concurrency to unlimited

D) Migrate to Aurora

**Answer: B**

Explanation: Lambda opens a DB connection from an independent execution environment for each concurrent execution, so as concurrency grows, connections surge and exceed RDS's max_connections. **RDS Proxy** maintains and reuses a connection pool between Lambda and the DB so that many Lambda invocations share a small number of DB connections - resolving connection exhaustion with minimal code changes. A (scaling up the instance) raises max_connections but isn't a fundamental fix and only increases cost. C (unlimited concurrency) makes the problem worse. D (migrating to Aurora) is an excessive change and doesn't itself provide connection pooling (Aurora also recommends RDS Proxy). Pitfall: "Lambda + DB connection explosion" is RDS Proxy.

---

**Question 7.** A global SQL database must recover in another Region with RPO under 1 second and RTO within 1 minute when the primary Region fails. Normally the secondary Region shares the read load. What is the most suitable design?

A) RDS Multi-AZ

B) Aurora Global Database

C) DynamoDB Global Tables

D) Manual promotion of a Cross-Region Read Replica

**Answer: B**

Explanation: "Global SQL + RPO<1s + RTO in minutes + secondary Region read sharing" is exactly where Aurora Global Database is used. Asynchronous replication at the storage layer typically achieves an RPO under 1 second, and the secondary Region shares load as a read-only replica and is promoted within minutes during a disaster. A (Multi-AZ) tolerates only AZ failures within a single Region and is powerless against a Region failure. C is NoSQL, so it doesn't fit the "SQL" requirement. D (manually promoted Read Replica) has large replication lag, and promotion is manual and slow, so it can't meet the RTO (Aurora Global uses dedicated replication infrastructure and is far faster). Pitfall: "global SQL + RPO in seconds + fast promotion" is Aurora Global Database.

---

## 📌 Today's Summary

1. Compute is an abstraction ladder (EC2→Fargate→Lambda) - understand Firecracker, cold starts, and hard limits
2. Data is CAP/PACELC - global+eventual is DynamoDB (AP/EL), strong consistency is Aurora (PC/EC), and Aurora is "log = DB" with a 4/6 quorum
3. Events decouple - At-Least-Once with idempotent consumption is the default, replay and multiple consumers is Kinesis, isolated fan-out is SNS→SQS
4. Availability is an isolation ladder (AZ→Region→Account), watch for us-east-1 dependency, and the cache invalidation trap
