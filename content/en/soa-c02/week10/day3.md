# Day 3 - RDS Multi-AZ vs Read Replica: Choosing Between Synchronous and Asynchronous

Database availability ultimately reduces to one physical law: **light is not infinitely fast.** Between Seoul and Virginia, the round trip via fiber-optic is roughly 180ms—not something AWS can shorten with money, but a hard limit set by light speed. If a database "waits for replication to replicas before completing writes" (synchronous), every transaction slows by this round-trip time. If it "doesn't wait" (asynchronous), it's fast but replicas lag. All difference between RDS Multi-AZ and Read Replica stems from this synchronous/asynchronous choice.

The reason this is exam's most-missed topic is that both appear superficially similar—both look like "placing another DB somewhere." But Multi-AZ is **synchronous replication standby for availability**, while Read Replica is **asynchronous replicated worker for read scale-out**. Opposite goals, opposite replication methods, opposite client access. This article explores the physical meaning of sync/async through to how Aurora redesigns this tradeoff.

## Synchronous Replication—Multi-AZ's Price for Never Losing Data

RDS Multi-AZ places a Standby instance in a **different AZ in the same region** and **synchronously** replicates all writes from Primary to Standby. Precise meaning of "synchronous" is critical—when application commits a transaction, Primary writes the change to its disk **and simultaneously** sends to Standby, **not completing the commit as successful until Standby acknowledges "received and written to disk."** So the instant client gets "commit success," that data is already safely on disk in two AZs.

Why matters: even if Primary completely fails, Standby has every commit up to the last—**zero data loss (RPO = 0)**. RDS detects Primary failure and auto-promotes Standby to new Primary, **switching the DNS endpoint to the new Primary.** Application keeps using the same endpoint; only the instance behind changes—failover completes typically in 60~120 seconds.

Synchronous replication's cost is **write latency**. All commits wait for inter-AZ round trips (typically 1~2ms within same region, small), slowing slightly. That's why Multi-AZ operates **only within same region**—cross-region sync replication would add 180ms to every commit, essentially paralyzing the DB. **That's why Multi-AZ isn't DR.** It survives single-AZ failure within region but not region-wide outage (rare but happens). Region-level DR falls to Cross-Region Read Replica or Aurora Global Database.

> 💡 **Related Theory**: Sync replication and zero data loss (RPO=0) directly tie to distributed systems' **CAP Theorem**. CAP says during network partition, you can't perfectly achieve both Consistency and Availability. Multi-AZ sync replication chooses Consistency—waits for Standby ack so both AZs always have same data, but that ack-waiting delays writes. Read Replica's async replication chooses Availability/Performance—no ack-wait so it's fast but replicas lag (replication lag). "Must never lose data (sync)" vs "slight lag is OK if fast (async)" is the practical translation of Consistency vs Availability.

> 🔍 **Deeper Dive**: Regular RDS Multi-AZ (Primary+Standby) Standby is inaccessible to clients—pure standby so can't even read. But **Multi-AZ DB Cluster** (MySQL/PostgreSQL only) differs. 1 Primary + 2 Readers in 3-node structure, two Readers receive near-sync replication **and handle read traffic**, with failover under 35 seconds. So Multi-AZ DB Cluster gives "HA + light read scale-out" together. Confusing regular Multi-AZ Instance (Standby unreachable) with Multi-AZ DB Cluster (Readers reachable) causes exam traps—"Multi-AZ but read-scaled?" is true only in DB Cluster config.

## Asynchronous Replication—Why Read Replica Is Fast but Lags

Read Replica serves opposite purpose. Primary's changes flow **asynchronously** to replicas, which expose via **separate endpoint** to receive read-only traffic. Asynchronous means Primary **doesn't wait for replica ack**—commit completes on Primary disk write, change logs flow lazily afterward to replicas. So Primary write performance barely depends on replica count or distance.

The cost: **replication lag**. Replicas always lag Primary slightly (milliseconds to seconds, more under load). Data just written to Primary might not exist yet on read from replica (read-after-write inconsistency). That's why Read Replicas suit "slight lag OK" reads—analytics, reports, dashboards, search—while "immediate read after write" transaction reads go to Primary.

Read Replica's two powerful uses: First, **Cross-Region Read Replica**—replicas can live in other regions. Async means inter-region 180ms latency doesn't hurt Primary performance (doesn't wait anyway). Second, **promote**—replica becomes independent DB. If Primary's entire region fails, promote replica in different region to new Primary. This is why Cross-Region Read Replica becomes **DR tool**. But promote is manual (or automation-triggered), and promoting breaks replication, making it independent.

| Item | Multi-AZ (Instance) | Read Replica |
|------|---------------------|--------------|
| Purpose | Availability (HA) | Read scale-out + Cross-Region DR |
| Replication | Sync (ack-wait) | Async (no wait) |
| Data Loss (RPO) | 0 | Replication lag possible |
| Client Reads | No (Standby standby) | Yes (separate endpoint) |
| Cross-Region | No (same region only) | Yes |
| Failure Response | Auto failover (60~120s, endpoint persists) | Manual promote (relationship breaks) |
| Write Performance Impact | Slightly slower (AZ round trip) | None |

> ⚠️ **Trap**: Choosing Read Replica for "higher availability" or Multi-AZ for "read distribution" ranks among most common wrong answers. Multi-AZ Standby **can't even read**, so zero read scale-out help. Read Replica async means Primary failure loses last seconds of data, no RPO=0 availability guarantee. Need both? Use together—Multi-AZ for HA, add Read Replica for read spread. Exam keywords: "single AZ failure auto-recover/no data loss" → Multi-AZ; "read performance/report load" → Read Replica; "region failure prep" → Cross-Region RR or Aurora Global DB.

## Aurora—Making Replicas Storage's Job, Not Instances'

RDS replication is per-instance—Primary generates change logs, sends to other instances, receivers replay. Aurora fundamentally inverted this. **Replication happens at storage layer, not instance.** Aurora clusters separate compute (DB instances) from storage; storage is a **shared distributed volume auto-replicated 6-way across 3 AZs**. Writer and Reader both see this **single shared storage**.

This changes much. RDS Read Replica each holds their own copy, must replay logs, so replication lag is large. Aurora Readers **share storage with Writer**, so no log replay needed—see latest data usually within tens of milliseconds. Storage 6-way replicated, so disk damage (self-healing) auto-recovers; 4/6 alive enables reads, 3/6 enables writes—**quorum** model reaching 99.99% availability.

```
Aurora Cluster
├── Cluster Endpoint  (Writer, read/write — always points to current Primary)
├── Reader Endpoint   (load-balance reads across all Readers)
├── Custom Endpoint   (specific instance group — e.g., analysis-only large instances)
└── Instance Endpoint (individual instance direct)

Storage Layer:
   6 copies / 3 AZ (automatic, quorum 4/6 read·3/6 write)
   Continuous backup to S3
   Self-healing (auto-recover damage blocks)
```

Multiple endpoints exist for this architecture. **Cluster Endpoint** always points to current Writer, auto-shifting to new Writer on failover; **Reader Endpoint** distributes reads across all Readers. Application sends writes to Cluster Endpoint, reads to Reader Endpoint—instance adds/removes/failover and it doesn't matter.

> 💡 **Related Theory**: Aurora's quorum replication uses distributed consensus theory's **quorum systems** directly. With N replicas, set write quorum W and read quorum R such that `W + R > N` ensures read and write sets intersect, always reading latest. Aurora sets N=6, W=4, R=3, satisfying `4+3 > 6`—with this margin one AZ (2 replicas) completely dies yet 4 remain to meet write quorum, plus 1 more dies and reads still work. The number 6 is reverse-engineered from goal "survive complete AZ failure + 1 additional replica failure simultaneously." Distributed DBs like Dynamo, Cassandra use identical quorum tuning math.

## Aurora Global Database—Surviving Region Failure in Under 1 Minute

Cross-Region Read Replica provides region DR but with instance-level async replication, large lag and sluggish failover. **Aurora Global Database** solves this via storage-layer replication. With 1 Primary Region + up to 10 Secondary Regions, Primary changes flow via **dedicated replication infra** to Secondary regions' storage. Since storage replicates across regions (not instances), typically achieves **RPO of seconds, RTO of minutes**.

Secondary regions are read-only, seeing latest data with tens-of-ms lag—providing fast reads to globe-local region users. Whole Primary region fails and **promote** Secondary within minutes to new Primary. Faster than RDS Cross-Region RR's manual promote, far less data loss.

| Tool | Scope | Replication Unit | RPO/RTO | Main Use |
|------|-------|------------------|---------|----------|
| Multi-AZ | Same-region AZ | Sync, instance | RPO 0 / RTO 1~2min | HA |
| Cross-Region Read Replica | Cross-region | Async, instance | RPO minutes / RTO manual | Read+DR(RDS) |
| Aurora Global Database | Cross-region | Async, storage | RPO seconds / RTO minutes | Global read+DR(Aurora) |

> 📚 **Case Study**: December 2021, major AWS us-east-1 region outage disabled many services. Single-region dependent (Multi-AZ only) workloads went down together, but Aurora Global Database or Cross-Region replica-holders could promote Secondary for recovery. This taught industry "Multi-AZ is for AZ failure, not region failure." us-east-1 is AWS's largest/oldest region with parts of global control plane here, so this region outage caused wide impact multiple times. Omit region-level DR from design and no matter how dense you pack Multi-AZ, you're bound to single region's fate.

## PITR and Backtrack—Two Ways to Rewind Time

Both RDS and Aurora rewind time but differently. **PITR (Point-in-Time Recovery)**, seen Day 2, uses base snapshot + transaction log replay to create **new instance at any past time**. Works within auto-backup retention (1~35 days), doesn't touch original.

Aurora's **Backtrack** is entirely different mechanism. PITR creates new instance; Backtrack **rewinds existing cluster itself to past moment.** Aurora stores change history on storage so "rewind 10 minutes" returns that cluster to past state right there—seconds to minutes, no new instance creation. Beats PITR (new instance, tens minutes) for fast undo of bad deploy or typo query. But rewind erases data after that point.

> 🔍 **Deeper Dive**: Backtrack's speed stems from Aurora's log-centric (log-structured) storage. Aurora doesn't write data pages directly like traditional DB; **sends only redo logs to storage, storage layer constructs pages from logs.** Change history stacks in storage as logs already, so rewind to past point is roughly "move log pointer to that point"—no need to restore/replay data fresh, so very fast. But Backtrack needs pre-activation and target backtrack window set up; costs extra storage for that window. Distinguish PITR (any-point within retention, new instance) from Backtrack (within configured window, same cluster rewind) for exams.

## RDS Proxy—Connection Pool Stopping Connection Storm

Serverless like Lambda meeting RDS triggers unique problem. Lambda's concurrent explosion spins up hundreds to thousands of function instances, **each opening direct DB connection.** DB's max connections tie to instance memory (e.g., db.t3.medium permits hundreds), quickly exceeded; connection setup cost (TCP+TLS+auth) repeats per connection, crushing DB under connection management. This is **Connection Storm**.

**RDS Proxy** solves by placing **connection pool** in front of DB. Lambda connects to Proxy; Proxy maintains actual DB connections as few, reusing (multiplexing). Thousands of Lambda arrive but DB sees connections capped at pool size. Proxy also integrates Secrets Manager for safe credential management and, on Primary failover, quickly routes connections to new Primary, reducing failover time. **Lambda + RDS practically requires RDS Proxy**.

> ⚠️ **Trap**: "Solve Connection Storm by upsizing DB instance" scores wrong. Bigger instance raises max connections but Lambda scale far outpaces, not root fix and costs more. Plus per-request connection setup overhead is independent of instance size. Answer is **pool and reuse** connections with RDS Proxy. Exam question "Lambda simultaneous thousands call RDS → connection limit exceed" almost always answers RDS Proxy.

## Wrapping Up

All RDS availability tools diverge along one axis: sync vs async. Multi-AZ gets RPO=0 availability via sync replication at cost of same-region-only and Standby read-unable. Read Replica gets fast read scale and Cross-Region DR via async at cost of replication lag. Aurora pushes replication to storage layer, easing both tradeoffs; Global Database does region DR in 1 minute.

Five key takeaways for operators: ① Multi-AZ = HA (sync, RPO 0, same region, Standby no-read, auto failover). ② Read Replica = read scale (async, separate endpoint, Cross-Region yes, promote for DR). ③ Region DR = Cross-Region RR or Aurora Global DB (RPO seconds, RTO minutes). ④ Aurora splits compute/storage + 6-way/3AZ quorum; Reader shares storage so lag small. ⑤ Lambda + RDS needs RDS Proxy to stop Connection Storm—upsizing is wrong.

In the next article, we'll transcend databases, exploring S3 Replication, Storage Gateway, and Elastic Disaster Recovery that replicate/failover files, objects, and on-premises workloads across regions and to AWS.

---

## 📝 Practice Questions

**Question 1.** The goal is "automatic recovery from a single-AZ failure with no data loss." Which RDS feature is correct?

A) Add a Read Replica
B) Multi-AZ: synchronous replication to a Standby in another AZ, automatic failover (60 to 120 seconds), RPO 0
C) Create manual snapshots periodically
D) Cross-Region Read Replica

**Answer: B**

Explanation: Multi-AZ synchronously replicates every commit to a Standby in a different AZ of the same Region and completes the commit only after receiving the Standby's ack, so even if the Primary dies, everything up to the last commit exists on the Standby and data loss (RPO) is 0. When a failure is detected, it automatically promotes the Standby and switches the endpoint. A Read Replica (A) is asynchronous, so data up to the replication lag may be lost, and it is for read scaling; a Cross-Region RR (D) is for Region-level DR and is promoted manually.

---

**Question 2.** Read load (analytics and reports) on a production DB is surging. How can you distribute reads cost-effectively?

A) Increase the DB instance size
B) Add Read Replicas and distribute read traffic through a separate endpoint
C) Enable Multi-AZ
D) Take manual snapshots more often

**Answer: B**

Explanation: A Read Replica creates a read-only copy through asynchronous replication and exposes it through a separate endpoint, making it the right tool for distributing read load. The Standby of Multi-AZ (C) cannot even receive reads from clients, so it does nothing for read distribution. Increasing the instance size (A) is expensive and does not separate reads from writes. Read Replicas suit reads that can tolerate slight replication lag, such as analytics and reports.

---

**Question 3.** Even with Multi-AZ enabled, the DB went down along with a full us-east-1 Region outage. What is needed to survive a Region-level failure?

A) Apply Multi-AZ twice
B) Keep a copy in another Region using a Cross-Region Read Replica or Aurora Global Database, and promote it during an outage
C) A larger instance type
D) Manual Snapshot

**Answer: B**

Explanation: Multi-AZ survives only AZ failures within the same Region; because replication is synchronous, latency would grow across Regions, so it is kept within one Region. To prepare for a full Region outage, you keep an asynchronously replicated copy in another Region (a Cross-Region Read Replica) or an Aurora Global Database, and promote the Secondary when the Primary Region fails. Aurora Global DB provides the fastest Region-level DR, with RPO of seconds and RTO of minutes.

---

**Question 4.** You need to serve fast reads from Regions close to global users (Asia, US, Europe) and also need Region-level DR. Which tool is most suitable?

A) RDS Multi-AZ
B) Aurora Global Database: 1 Primary plus up to 10 Secondary Regions, storage-layer replication, RPO of seconds and RTO of minutes
C) Multiple Read Replicas in a single Region
D) DynamoDB Multi-AZ

**Answer: B**

Explanation: Aurora Global Database replicates changes from the Primary Region to the storage of up to 10 Secondary Regions over dedicated infrastructure, serving reads with tens of milliseconds of latency from the Region closest to each user while also providing Region DR (managed-failover RTO on the order of minutes). Because replication happens at the storage layer, latency and RTO are lower than with instance-level replication (RDS Cross-Region RR). It is the standard answer for global reads plus Region DR.

---

**Question 5.** During traffic spikes, a Lambda function opens thousands of concurrent connections to RDS, exceeding the DB's maximum connection limit. What is the fundamental solution?

A) Change the RDS instance to a larger type
B) RDS Proxy: place a connection pool in front of the DB and reuse a small number of real connections (multiplexing)
C) Enable Multi-AZ
D) Add a Read Replica

**Answer: B**

Explanation: With concurrent requests, Lambda function instances can surge into the thousands and each opens a connection directly to the DB, causing a connection storm. RDS Proxy places a connection pool in front of the DB so that even with thousands of Lambda invocations, the number of real connections the DB sees is limited to the pool size and reused. Enlarging the instance (A) cannot keep up with Lambda scaling and still leaves the connection-creation overhead, so it is not a fundamental fix. For Lambda with RDS, RDS Proxy is practically essential.

---

**Question 6.** You want to undo a bad migration on an Aurora cluster to its state 10 minutes ago as fast as possible. Which feature can rewind the same cluster without creating a new instance?

A) PITR(Point-in-Time Recovery)
B) Aurora Backtrack: rewind the same cluster to a past point in time within the configured window
C) Read Replica promote
D) Restore from a manual snapshot

**Answer: B**

Explanation: PITR (A) restores a base snapshot and replays logs to create a new instance at any point in time, taking tens of minutes. Aurora Backtrack uses the log-structured storage design to rewind the existing cluster itself to a past point in time, finishing in seconds to minutes. However, Backtrack must be enabled in advance with a rewind window configured, and rewinding discards data after that point in time. Use Backtrack for a quick undo, and PITR for a separate restore to an arbitrary point in time.

---

**Question 7.** A Multi-AZ setup now has an added requirement to "also distribute read load." Which RDS configuration provides both HA and read distribution in a MySQL/PostgreSQL environment?

A) A regular Multi-AZ Instance alone is sufficient
B) Multi-AZ DB Cluster: a structure of 1 Primary plus 2 Readers, where the Readers serve read traffic and failover takes 35 seconds or less
C) Add only a Cross-Region Read Replica
D) Create snapshots more often

**Answer: B**

Explanation: The Standby of a regular Multi-AZ Instance (A) cannot be accessed by clients, so reads cannot be distributed. A Multi-AZ DB Cluster is a 3-node structure of 1 Primary plus 2 Readers; the two Readers serve read traffic, providing HA and read distribution together, and failover is faster at 35 seconds or less (MySQL/PostgreSQL only). You can also attach a Read Replica separately to a regular Multi-AZ, but the DB Cluster integrates this into a single configuration.

---
