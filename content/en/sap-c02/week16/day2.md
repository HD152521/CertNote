# Day 2 - Exam Strategy & Question Patterns — Recognizing Trade-offs, Ruling Out Decoys, Time Management

SAP-C02 is **not memorization** — it's **trade-off judgment under constraints.** Most questions hide a hidden constraint (time, budget, regulatory, geographic) that selects one pillar over another.

Pattern recognition:
- "Minimize cost" → Look for cheapest option meeting non-cost constraints
- "No downtime" → RTO=0 → Multi-Site Active-Active, not Pilot Light
- "Regulatory compliance" → Security/Compliance > Cost always
- "Startup, $0 budget" → Serverless autoscale, not provisioned capacity
- "6 months deadline, 100TB" → Rehost first (MGN), Refactor later, not Refactor-all-upfront
- "Global" without region constraints → Assume GDPR/sovereignty applies
- "Audit/compliance" keyword → Immutable log, separate account, Object Lock Compliance, root can't change

Decoy patterns:
- "Use the latest service" → Not always right; older services often cheaper/simpler
- "Maximize all metrics" → Impossible; prioritize by business impact
- "Most expensive solution" → Not Pro; efficiency wins
- "Technical perfection" → Versus practical constraints

Time management: ~130 questions, ~2 min/question average
- Diagram/scenario reading: 30s
- Identify business constraint: 20s
- Match to pillar/tool: 40s
- Eliminate decoys: 30s

Key insight: **"What makes this architecture okay to fail at?" = "What constraint am I optimizing?"**

[6 EXERCISES: Pattern matching by keyword, constraint extraction, decoy elimination, confidence calibration, review strategy]

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