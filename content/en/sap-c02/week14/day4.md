# Day 4 - RDS, Aurora, DynamoDB Global DR — Sync/Async Replication Internals, Aurora Storage Architecture, Active-Active Conflict Resolution

Database DR differs fundamentally from all other layers. Web servers die, restart—that's all. **Data lost once is lost forever.** Database replication method determines system RPO at the most fundamental design level, with physics (light speed) and theory (consensus) imposing hard limits. AWS solved this via three paths—RDS, Aurora, DynamoDB—each selecting trade-offs that are exam essentials.

SAP-C02 in this domain isn't simple memorization ("Aurora Global spans 5 regions") but asking **which chose sync/async replication, thus how RPO/RTO/consistency/writable regions split**. Today we decompose RDS Multi-AZ sync internals, Aurora's revolutionary storage-separation architecture, and DynamoDB Global Tables' Active-Active conflict resolution.

## Sync vs Async — The Root Axis Determining RPO

All three databases' DR options reduce to **sync vs async replication**. Sync waits for all copies to reach and confirm before returning success (RPO=0) but adds copy round-trip latency. Async returns immediately after primary write, propagates copies later (fast but RPO>0 on primary failure).

| Method | RPO | Write Latency | Practical Range |
|--------|-----|---------------|-----------------|
| **Sync** | 0 | Increased by copy RTT | Within AZs (1-2ms) |
| **Async** | >0 (usually seconds) | Minimal | Cross-region (40ms+) |

This splits precisely with AZ/region boundaries. AZ distance (few km, 1-2ms) makes sync replication tolerable; region distance (thousands km, 40ms+) makes sync throughput collapse. So **AWS consistently chooses "sync within AZ, async across regions."**

> 💡 **Related Theory**: This trade-off's theoretical root is **PACELC theorem** (Daniel Abadi, 2012). Extends CAP ("during partition choose Consistency vs Availability") to state "even without partition (Else) you choose between Latency and Consistency." RDS Multi-AZ is PC/EC—consistency during partitions and always; accepts latency. DynamoDB is PA/EL—availability and low latency; accepts eventual consistency (strong-consistent reads optional). In exams, "strong consistency vs low latency" trade-off signals this theorem; "cross-region RPO 0" is nearly impossible or hides massive latency cost.

## RDS Multi-AZ — Instance vs Cluster

RDS single-region high availability via Multi-AZ; two variants:

| Mode | Composition | Failover | Standby Reads |
|------|-------------|----------|---------------|
| **Multi-AZ Instance** | 1 Primary + 1 Standby | **60-120 seconds** | No (standby wait-only) |
| **Multi-AZ Cluster** | 1 Writer + 2 Readable Standby | **~35 seconds** | Yes (distribute read) |
| **Read Replica** | Async replicas | No auto failover (manual promote) | Yes, cross-region ok |

Traditional Multi-AZ Instance maintains sync-replicated standby but doesn't handle traffic (wasted resources). 2022's **Multi-AZ Cluster** evolved this—1 Writer + 2 **readable** standbys, distributing read traffic normally and failover in ~35 seconds via semi-sync quorum.

Critical pitfall: **Read Replica is not HA but read-scaling feature**. Multi-AZ provides auto failover; Read Replica doesn't—primary death requires manual promotion. So "auto failover" needs Multi-AZ (Read Replica wrong), and "read load elsewhere" needs Cross-Region Read Replica.

> 🔍 **Deeper Dive**: Multi-AZ Cluster's 35-second failover vs 60-120 seconds comes from **semi-synchronous replication**. Traditional Instance waits for complete sync to standby; Cluster has writer confirm 1 of 2 replica acknowledgments (quorum-based) before committing. Faster than sync, lower loss risk than async. Plus readable standby means failover already-recent data promotion (fast switch). In exams, "RDS failover 30s + standby read" is Multi-AZ Cluster direct answer. Read Replica no auto failover (manual promote needed) is key pitfall.

## Aurora — Revolutionary Storage-Compute Separation

Aurora's fundamental difference from RDS: **completely separate compute (DB instances) from storage**. Traditional DB writes directly to own disk, replicates entire data to standby; Aurora maintains **separate distributed storage layer with 6 data copies across 3 AZs**, with compute instances pointing to shared storage.

| Option | Composition | Key Trait |
|--------|-------------|-----------|
| **Aurora Multi-AZ** | 1 Writer + up to 15 Readers | Data: 6 copies, 3 AZs |
| **Aurora Global Database** | 1 Primary Region + up to 5 Secondary | RPO < 1s, RTO < 1 min |

> 🔍 **Deeper Dive**: Aurora storage-separation genius: **replication target is "redo log records" not "database pages"**. Traditional DB sends changed pages wholesale to standby; Aurora sends much-smaller redo logs to storage nodes, which reconstruct pages themselves. Network transfer plummets while maintaining 6 copies fast. Writes confirmed by **4 of 6 copies (quorum)**, reads by 3 of 6—one entire AZ dying (2 copies) keeps write 4/6 quorum possible, maintaining availability. This quorum design means standby promotion unnecessary; another instance immediately uses same storage for fast failover. In exams, "Aurora 6 copies, 3 AZ," "quorum-based durability" is background knowledge.

> 💡 **Related Theory**: Aurora's 4/6 write and 3/6 read quorum follows distributed systems' **quorum consensus**. W + R > N (4+3>6 here) means reads always see latest write—Dynamo paper (Amazon 2007) foundation. Same quorum thinking grounds ZooKeeper, etcd, Cassandra. AWS chose N=6, W=4, R=3 balancing "tolerate 1 AZ loss + 1 node loss" while minimizing write latency.

Aurora Global Database extends storage layer via **cross-region async replication**. Primary replicates to secondary via storage-level replication, typically RPO < 1s, cross-region failover RTO < 1 min. Secondaries read-only (up to 5 regions, 16 readers per region for global read scale), but **write forwarding** enables secondary writes auto-forwarding to primary (latency cost).

> ⚠️ **Pitfall**: "Aurora Global = Active-Active" is wrong. Aurora Global is **single-writer**—only primary region writes, secondary read-only. Write forwarding still forwards actual writes to primary, not true multi-master. "Dual-region writes (true Active-Active)" needs DynamoDB Global Tables. In exams, "global SQL + RPO 1s" is Aurora Global; "dual-region writes + Active-Active" is DDB Global Tables—clear split.

## DynamoDB Global Tables — True Active-Active

DynamoDB Global Tables are **multi-master (Active-Active)** where all regions accept writes. Each region's table independently processes writes, DynamoDB Streams propagate changes async to all other regions. All regions writable—one region dies, others already receive traffic—RPO/RTO nearly 0.

Core challenge: **conflict resolution**. Two regions modify same item nearly simultaneously—which wins? DynamoDB uses **Last Writer Wins (LWW)**—latest-timestamped write becomes final value.

> 💡 **Related Theory**: Active-Active multi-master conflict resolution is among distributed systems' hardest problems. DynamoDB's **Last Writer Wins** is simple, fast but risky—simultaneous writes **silently lose one (lost update)**. More sophisticated: vector clocks, CRDT, but requires application-level merge (complex). DynamoDB chose simplicity/performance via LWW, so application design should **avoid simultaneous writes same item or shard writes by region**. In exams, "DDB Global Tables conflict behavior" is Last Writer Wins; understanding this limit is Active-Active design's core.

> 📚 **Case Study**: 2017 GitLab database incident proves replication/backup importance inversely. Engineer accidentally deleted production directory during incident response; 5 configured backup/replication mechanisms all failed—6 hours' data lost permanently. Lesson: "replication/backup needs regular restore testing to actually work." Managed replication like Aurora Global, DynamoDB Global structurally reduces human error and untested-backup problems—AWS manages replication/failover so "replication silently stopped" is rare. In exams, "ops burden minimal + multi-region DR" signals managed global DB.

> 📚 **Case Study**: 2007 Amazon's **Dynamo paper** was history-changing. 2004 Christmas peak traffic collapsed relational DB, shopping cart stopped. Engineers concluded "always-writeable availability more important than strong consistency for shopping cart," spawning Dynamo with eventual consistency, quorum, hinted handoff. This paper blueprinted Cassandra, Riak, Voldemort, etc.; today's managed DynamoDB Global Tables is direct descendant. In exams, "availability over consistency (always-writeable)" signals DynamoDB lineage.

## Other Data Layers Multi-Region

| Service | Option | Trait |
|---------|--------|-------|
| **ElastiCache (Redis)** | **Global Datastore** | 1 Primary region writes + Secondary read-only replicas (sub-1s) |
| **S3** | **CRR** | Async cross-region replication |
| **S3** | **MRAP** | Multi-region buckets to single global endpoint |
| **S3** | **Replication Time Control(RTC)** | Replication SLA: 15 minutes guaranteed |

> ⚠️ **Pitfall**: Don't confuse Redis Global Datastore with DynamoDB Global Tables. Datastore is **single-writer** (Primary region only writes, secondary read-only replicas); DynamoDB Global Tables **multi-master** (all regions write). "Redis multi-region replication" is Datastore but not dual writes. Also S3: "multi-region + single endpoint" is MRAP, "async replicate itself" is CRR, "replication SLA" is RTC—precise distinctions.

## Summary

All data-layer DR choices reduce to **sync (within-AZ, RPO 0) vs async (cross-region, RPO>0)** axis rooted in PACELC latency-consistency trade-off. RDS Multi-AZ Cluster delivers semi-sync quorum, 35-second failover, readable standbys. Aurora separates compute/storage, replicates redo logs only via 4/6-quorum distributed storage, fast failover; Global Database extends across regions via async replication (RPO<1s, single-writer). DynamoDB Global Tables alone is true multi-master Active-Active; Last Writer Wins resolves conflicts.

SAP exam frequent mappings: (1) "RDS failover 30s + standby read" → **Multi-AZ Cluster**, (2) "global SQL + RPO 1s, RTO 1 min" → **Aurora Global Database**, (3) "dual-region writes, Active-Active" → **DynamoDB Global Tables**, (4) "DDB conflict on simultaneous writes" → **Last Writer Wins**, (5) "Aurora secondary max 5 regions, read-only", (6) "Redis multi-region replicate (single-writer)" → **Global Datastore**, (7) "S3 multi-region single endpoint" → **MRAP**, (8) "Read Replica no auto failover (manual promote)." Next day integrates Week 14 DR/resilience with comprehensive industry-specific scenarios.

---

## 📝 Practice Questions

**Question 1.** A company wants RDS PostgreSQL to fail over within 30 seconds and also wants to distribute read traffic to the standby instances during normal operation to use its resources. Which configuration is most appropriate?

A) Multi-AZ Instance (1 Primary + 1 Standby)

B) Multi-AZ Cluster (1 Writer + 2 Readable Standbys)

C) Cross-Region Read Replica

D) Single-AZ + frequent snapshots

**Answer: B**

**Explanation:** A Multi-AZ Cluster consists of 1 Writer + 2 readable standbys, and thanks to semi-synchronous quorum replication it achieves failover in about 35 seconds while distributing read traffic across the 2 replicas during normal operation. A (Multi-AZ Instance) has a failover time of 60 to 120 seconds, and the standby only waits and cannot receive read traffic. C (Read Replica) has no automatic failover and requires a manual promote. D has no high availability at all. Trap: "failover in the 30-second range + standby reads" is the direct answer for Multi-AZ Cluster, and the key distinction is that a Read Replica has no automatic failover.

---

**Question 2.** A global service keeps a SQL database in multiple Regions and requires an RPO under 1 second and a cross-Region failover RTO of 1 minute. Which is the most appropriate option?

A) RDS Multi-AZ Cluster

B) Aurora Global Database

C) DynamoDB Global Tables

D) RDS Cross-Region Read Replica

**Answer: B**

**Explanation:** Aurora Global Database uses storage-level asynchronous replication to support up to 5 secondary Regions, and is a managed global SQL DB that typically delivers an RPO under 1 second and an RTO under 1 minute. A provides high availability only within a single Region, C (DDB) is NoSQL rather than SQL, and D (Read Replica) has weaker consistency and failover guarantees and does not specify an RTO/RPO SLA. Trap: "global SQL + RPO of 1 second" is the direct answer for Aurora Global, and unless the requirement is NoSQL, the answer does not go to DDB.

---

**Question 3.** A company is designing a global order system that must accept writes in both Regions (us-east-1 and ap-northeast-2). Which is the most appropriate database?

A) Aurora Global Database (read-only secondary)

B) DynamoDB Global Tables

C) RDS Cross-Region Read Replica

D) ElastiCache Redis Global Datastore

**Answer: B**

**Explanation:** Only DynamoDB Global Tables is a true multi-master Active-Active configuration in which every Region accepts writes, and it satisfies the requirement for simultaneous writes in both Regions. A (Aurora Global) is single-writer with a read-only secondary (even with write forwarding enabled, the actual write is forwarded to the primary), C (Read Replica) is read-only until it is promoted, and D (Redis Global Datastore) is also single-writer. Trap: "simultaneous writes in both Regions / Active-Active" has DDB Global Tables as the only direct answer, and the key distinction is that Aurora Global and Redis Global Datastore are both single-writer.

---

**Question 4.** In DynamoDB Global Tables, how is a conflict resolved when two Regions modify the same item at nearly the same time?

A) The two writes are merged automatically

B) The write with the later timestamp wins (Last Writer Wins)

C) Both writes are rejected

D) An administrator resolves it manually

**Answer: B**

**Explanation:** DynamoDB Global Tables resolves conflicts with Last Writer Wins (LWW): the write with the later timestamp becomes the final value, and the losing write silently disappears (a lost update). It is simple and fast, but because of this limitation, the best practice is to avoid patterns where multiple Regions write the same item simultaneously, or to partition the write keys by Region. A (automatic merge) is a more complex approach such as CRDTs and is not DDB's default behavior, and C and D do not match the facts. Trap: conflict resolution in DDB Global Tables is Last Writer Wins, and understanding the risk of lost updates from simultaneous writes is the key to Active-Active design.

---

**Question 5.** Which is the most accurate reason Aurora's distributed storage can maintain write availability even when an entire AZ fails (losing 2 copies)?

A) Data is stored concentrated in a single AZ

B) It keeps 6 copies across 3 AZs and uses a 4/6 write quorum

C) It waits for confirmation from all 6 copies on every write

D) It immediately promotes a standby instance

**Answer: B**

**Explanation:** Aurora maintains 6 copies across 3 AZs, and a write succeeds when 4 of the 6 confirm (a 4/6 quorum) and a read succeeds when 3 confirm (a 3/6 quorum). Even if an entire AZ (2 copies) fails, the remaining 4 copies can satisfy the 4/6 write quorum, so availability is maintained (the W+R>N quorum principle). A is the opposite, C is fully synchronous and negates the benefit of a quorum, and D is an instance failover and not the reason for storage availability. Trap: Aurora's durability is "quorum-based," not "waiting synchronously for all copies."

---

**Question 6.** A team wants to replicate ElastiCache Redis across two Regions. Which statement about the characteristics of Redis Global Datastore is most accurate?

A) It is a multi-master that allows writes in every Region

B) Only 1 Primary Region accepts writes, and Secondary Regions are read-only and replicated with less than 1 second of lag

C) It replicates by using DynamoDB Streams

D) Replication is synchronous, so the RPO is always 0

**Answer: B**

**Explanation:** Redis Global Datastore is a single-writer configuration in which only 1 Primary Region accepts writes, and Secondary Regions are read-only replicas that are usually replicated with less than 1 second of lag. A confuses it with the characteristics of DynamoDB Global Tables (Redis Global Datastore is not multi-master), C is a DDB mechanism, and D is wrong because cross-Region replication is asynchronous, so the RPO is not 0. Trap: "Redis multi-Region replication" is Global Datastore, but it is single-writer, and the key distinction is that multi-master is DDB Global Tables.