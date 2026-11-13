# Day 4 - DR for RDS, Aurora, and DynamoDB Global: Inside Synchronous and Asynchronous Replication, Aurora's Storage Architecture, and Active-Active Conflict Resolution

Database DR has a different grain from DR at every other layer. If a web server dies, you simply bring it back up, but **once data is lost, it is gone forever**. That is why the replication method at the data layer is the most fundamental design decision determining a system's RPO, and the physical and theoretical limits of the speed of light and distributed consensus apply here in full. AWS tackled this problem along three branches, RDS, Aurora, and DynamoDB, and the trade-off each one chose is the heart of the exam.

On SAP-C02, this area is not simple memorization ("Aurora Global supports up to 10 secondary Regions") but asks **whether each option chose synchronous or asynchronous replication, and therefore how RPO, RTO, consistency, and writable Regions split apart**. Today we break down, at the level of internal behavior, the synchronous replication inside RDS Multi-AZ, Aurora's innovative storage-separation architecture, and even the Active-Active conflict resolution of DynamoDB Global Tables.

## Synchronous vs. Asynchronous: The Fundamental Axis That Splits RPO

Every DR option of the three databases ultimately reduces to **synchronous replication or asynchronous replication**. Synchronous returns success only after the write has reached and been confirmed by all copies, so RPO=0, but the round-trip latency to the copies is added. Asynchronous returns success immediately upon writing to the primary and propagates to the copies later, so it is fast, but if the primary fails the unpropagated portion is lost, so RPO>0.

| Replication method | RPO | Write latency | Realistic scope of application |
|-----------|-----|----------|------------------|
| **Synchronous** | 0 | Increases by the copy's RTT | Between AZs (1~2ms) |
| **Asynchronous** | >0 (usually a few seconds) | Almost no impact | Between Regions (tens of ms) |

The key is why this distinction aligns with the AZ/Region boundary. Between AZs it is a few km (1~2ms), so the latency of synchronous replication is bearable, but between Regions it is thousands of km (40ms+), so applying synchronous replication would collapse every write. That is why **AWS databases consistently choose "between AZs = synchronous, between Regions = asynchronous."**

The theoretical root of this trade-off is the **PACELC theorem** (Daniel Abadi, 2012). It extends CAP ("during a partition, consistency C vs. availability A") by stating that "even when there is no partition (Else), you must choose between latency (Latency) and consistency (Consistency)." RDS Multi-AZ is PC/EC: it chooses consistency during a partition and consistency in normal operation as well, accepting the latency. DynamoDB by default leans PA/EL: it accepts eventual consistency for availability and low latency (strongly consistent reads are an option). When a "strong consistency vs. low latency" trade-off appears on the exam, this theorem is the background, and you should be suspicious that "cross-Region RPO of 0" is nearly impossible or comes at a large latency cost.

## RDS Multi-AZ: Instance vs. Cluster

RDS achieves single-Region high availability with Multi-AZ, and there are two kinds.

| Mode | Configuration | Failover | Standby reads |
|------|------|----------|-------------|
| **Multi-AZ Instance** | 1 Primary + 1 Standby | **60~120 seconds** | Not possible (the standby only waits) |
| **Multi-AZ Cluster** | 1 Writer + 2 Readable Standbys | **About 35 seconds** | Possible (read from the 2 replicas) |
| **Read Replica** | Asynchronous replica | No automatic failover (manual promote) | Possible, also in another Region |

The traditional Multi-AZ Instance keeps the standby with synchronous replication, but the standby receives no traffic and exists only to wait for a failure (a waste of resources). The **Multi-AZ Cluster**, launched in 2022, evolved this: with 1 Writer + 2 **readable** standbys, it normally spreads read traffic across the 2 replicas and fails over in about 35 seconds on a failure.

Let's nail down one key trap. **A Read Replica is not a high availability (HA) feature but a read scaling feature.** Unlike Multi-AZ, which provides automatic failover, a Read Replica is not promoted automatically even if the primary dies: a person must manually promote it to become the new primary. So when "automatic failover" is required, a Read Replica is the wrong answer and Multi-AZ is correct, and when "spread read load in another Region" is required, a Cross-Region Read Replica is correct. Mixing up the purposes of the two leads into a trap on the exam.

The secret by which Multi-AZ Cluster cut failover from 60~120 seconds to 35 seconds is **semi-synchronous replication**. The traditional Multi-AZ Instance waits for fully synchronous replication to the standby, whereas the Cluster returns the commit ack once the writer confirms the data has reached **at least 1 of the 2** replicas (quorum-based). This is a compromise that is faster than fully synchronous and has lower data loss risk than asynchronous. Also, because the standbys are readable, at failover it promotes a replica whose data is already almost current, so the switch is fast. When "RDS failover in the 30-second range + read traffic on the standby" appears on the exam, Multi-AZ Cluster is the direct answer. The key trap is that a Read Replica has no automatic failover (a manual promote is needed).

## Aurora: The Innovation of Separating Storage from Compute

What fundamentally differs between Aurora and RDS is an architecture that **completely separates compute (DB instances) from storage**. In a traditional DB, the instance writes directly to its own disk and replicates all the data to a standby, but Aurora has a separate **distributed storage layer that keeps 6 copies of the data across 3 AZs**, and the compute instances look at this shared storage.

| Option | Configuration | Key characteristic |
|------|------|----------|
| **Aurora Multi-AZ** | 1 Writer + up to 15 Readers | Data is 6 copies across 3 AZs |
| **Aurora Global Database** | 1 Primary Region + up to 10 Secondaries | typical replication lag under 1 second, RTO in the order of minutes |

The genius of Aurora's storage separation is that **what is replicated is not "database pages" but "redo log records."** A traditional DB sends the changed data pages whole to the standby, but Aurora sends only the much smaller redo log to the storage nodes, and the storage reconstructs the pages on its own. Network transfer drops dramatically, so it is fast even while keeping 6 copies. Also, a write counts as successful when **4 of the 6 (a quorum)** copies confirm it (4/6 write quorum), and a read is satisfied by 3 of the 6 (3/6 read quorum). Even if an entire AZ (2 copies) dies, the write can still fill the 4/6 quorum, so availability is maintained. Thanks to this quorum design, when an instance fails, another instance looks at the same storage immediately without a standby promotion, so failover is fast. "Aurora 6 copies across 3 AZs" and "quorum-based durability" lie underneath as background knowledge on the exam.

Aurora's 4/6 write and 3/6 read quorum is the **quorum consensus** principle of distributed systems. It rests on the theorem that if W + R > N (here 4 + 3 > 6) is satisfied, a read always sees the latest write. This is an extension of the sloppy quorum idea established in the Dynamo paper (Amazon, 2007), and the same quorum thinking underlies nearly every distributed data system such as ZooKeeper, etcd, and Cassandra. The reason AWS chose N=6, W=4, R=3 is that it is the balance point that tolerates "the loss of 1 AZ + the loss of 1 node" while minimizing write latency.

Aurora Global Database extends this storage layer with **cross-Region asynchronous replication**. The primary Region performs storage-level replication to the secondaries, and typical replication lag is under 1 second and a cross-region failover RTO is in the order of minutes. Secondaries are read-only (up to 10 secondary Regions, with up to 16 readers per Region for global read scaling), but if you turn on **write forwarding**, writes arriving at a secondary can be automatically forwarded to the primary (at a latency cost).

> ⚠️ **Trap**: It is wrong to misunderstand "Aurora Global = Active-Active." Aurora Global is essentially **single-writer**: only the primary Region receives writes, and the secondaries are read-only. Even with write forwarding on, the actual writes are forwarded to and processed on the primary, so it is not true multi-master. If you need "simultaneous writes in both Regions (true Active-Active)," it is DynamoDB Global Tables. On the exam, "global SQL + RPO of 1 second" is Aurora Global, and "writes in both Regions + Active-Active" is DDB Global Tables, a clean split.

## DynamoDB Global Tables: True Active-Active

DynamoDB Global Tables is a **multi-master (Active-Active) configuration where every Region receives writes**. Each Region's table processes writes independently and propagates changes asynchronously to all the other Regions through DynamoDB Streams. Since every Region is writable, even if one Region dies, the other Regions are already receiving traffic, so RPO and RTO are nearly 0.

The key challenge is **conflict resolution**. If two Regions modify the same item almost at the same time, which one wins? DynamoDB uses **Last Writer Wins (LWW)**: the write with the later timestamp becomes the final value.

Conflict resolution in Active-Active multi-master is one of the hardest problems in distributed systems. The **Last Writer Wins** that DynamoDB chose is simple and fast but carries a risk: if two writes happen almost simultaneously, one is **silently lost (lost update)**. More sophisticated approaches include vector clocks and CRDTs (Conflict-free Replicated Data Types), but they are complex because the application has to merge the conflicts. DynamoDB chose LWW for simplicity and performance, so the best practice at application design time is to **avoid the pattern of writing the same item in multiple Regions at the same time, or to partition (shard) write keys by Region**. On the exam, the answer for "DDB Global Tables behavior on a conflict" is Last Writer Wins, and understanding this limitation is the heart of Active-Active design.

The 2017 GitLab database incident is a famous case that showed the importance of replication and backups by the opposite example. During incident response, an engineer deleted the production directory on the wrong server, and none of the 5 configured backup and replication mechanisms were working properly, so 6 hours of data was permanently lost. The lesson is that "replication and backups only truly work if you test restores regularly." Managed replication such as DynamoDB Global Tables or Aurora Global structurally reduces this kind of human error and unverified-backup problem: because AWS manages replication and failover, an accident of "replication had silently stopped" is hard to have. When "minimal operational burden + multi-Region DR" appears on the exam, a managed global DB is the direct answer.

The **Dynamo paper** that Amazon published in 2007 was not a mere product announcement but a turning point in the history of distributed databases. The paper explains that a relational database is "far from ideal" for services like the shopping cart that only store and retrieve data by primary key. The engineers reached the conclusion that "always-writeable availability matters more for a shopping cart than strong consistency," and built Dynamo, adopting eventual consistency, quorums, and hinted handoff. This paper became the blueprint for many NoSQL systems such as Cassandra, Riak, and Voldemort, and today's managed DynamoDB Global Tables is its direct descendant. When "availability prioritized over consistency (always-writeable)" appears on the exam, the DynamoDB family is the background philosophy.

## Multi-Region for Other Data Layers

| Service | Multi-Region option | Characteristics |
|--------|---------------|------|
| **ElastiCache (Redis)** | **Global Datastore** | Writes in 1 Primary Region + read replication to Secondaries (under 1 second) |
| **S3** | **CRR** | Asynchronous cross-region replication |
| **S3** | **MRAP** | Multi-Region buckets behind a single global endpoint |
| **S3** | **Replication Time Control (RTC)** | Guarantees a replication SLA of 15 minutes |

> ⚠️ **Trap**: Don't confuse Redis Global Datastore with DynamoDB Global Tables. Global Datastore is **single-writer** (only the Primary Region writes, secondaries are read-only replicas), whereas DynamoDB Global Tables is **multi-master** (all Regions write). "Redis multi-Region replication" is Global Datastore, but it is not "writes in both Regions." Also, on S3, "multi-Region + a single endpoint" is MRAP, "asynchronous replication itself" is CRR, and "a replication time SLA" is RTC, a clean split.

## Summary

Every choice in data-layer DR reduces to the axis of **synchronous (between AZs, RPO 0) vs. asynchronous (between Regions, RPO>0)**, and its root is PACELC's latency-consistency trade-off. RDS Multi-AZ Cluster provides 35-second failover and readable standbys with a semi-synchronous quorum, Aurora separates compute and storage and achieves fast failover with a 4/6-quorum distributed storage that replicates only the redo log, and it extends to cross-Region asynchronous replication (RPO<1 second, single-writer) with Global Database. Only DynamoDB Global Tables is true multi-master Active-Active, and it resolves conflicts with Last Writer Wins.

SAP exam mapping: (1) "RDS failover in the 30-second range + standby reads" → **Multi-AZ Cluster**, (2) "global SQL + RPO 1 second, RTO 1 minute" → **Aurora Global Database**, (3) "simultaneous writes in both Regions, Active-Active" → **DynamoDB Global Tables**, (4) "DDB behavior on a conflict" → **Last Writer Wins**, (5) "Aurora secondaries up to 10 Regions, read-only," (6) "Redis multi-Region replication (single-writer)" → **Global Datastore**, (7) "S3 multi-Region single endpoint" → **MRAP**, (8) "Read Replica has no automatic failover (manual promote)." The next day reviews all of Week 14's DR and resilience in an integrated way through industry-specific comprehensive scenarios.

---

## 📝 Practice Questions

**Question 1.** A company wants to achieve RDS PostgreSQL failover within 30 seconds and to put the standby instances to use by spreading read traffic to them normally. What is the most suitable configuration?

A) Multi-AZ Instance (1 Primary + 1 Standby)

B) Multi-AZ Cluster (1 Writer + 2 Readable Standbys)

C) Cross-Region Read Replica

D) Single-AZ + frequent snapshots

**Answer: B**

Explanation: Multi-AZ Cluster is a configuration of 1 Writer + 2 readable standbys, which achieves failover of about 35 seconds thanks to semi-synchronous quorum replication while spreading read traffic across the 2 replicas normally. A (Multi-AZ Instance) has failover of 60~120 seconds, and its standby only waits and cannot receive read traffic. C (Read Replica) has no automatic failover and needs a manual promote. D has no high availability at all. Trap: "failover in the 30-second range + standby reads" is the direct answer of Multi-AZ Cluster, and the key distinction is that a Read Replica has no automatic failover.

---

**Question 2.** A global service puts a SQL database in multiple Regions and requires an RPO under 1 second and a cross-region failover RTO of 1 minute. What is the most suitable option?

A) RDS Multi-AZ Cluster

B) Aurora Global Database

C) DynamoDB Global Tables

D) RDS Cross-Region Read Replica

**Answer: B**

Explanation: Aurora Global Database is a managed global SQL DB that, through storage-level asynchronous replication, can have up to 10 secondary Regions, with typical replication lag under 1 second and an RTO in the order of minutes. A provides only high availability within a single Region, C (DDB) is NoSQL rather than SQL, and D (Read Replica) has weaker consistency and failover guarantees and states no RTO/RPO SLA. Trap: "global SQL + RPO of 1 second" is the direct answer of Aurora Global, and unless there is a NoSQL requirement, the answer doesn't go to DDB.

---

**Question 3.** A company is designing a global order system that must receive writes in both Regions (us-east-1, ap-northeast-2). What is the most suitable database?

A) Aurora Global Database (Read-Only Secondary)

B) DynamoDB Global Tables

C) RDS Cross-Region Read Replica

D) ElastiCache Redis Global Datastore

**Answer: B**

Explanation: Only DynamoDB Global Tables is a true multi-master Active-Active configuration where every Region receives writes, satisfying the requirement for simultaneous writes in both Regions. A (Aurora Global) is single-writer with read-only secondaries (even with write forwarding on, the actual writes are forwarded to the primary), C (Read Replica) is read-only until promoted, and D (Redis Global Datastore) is also single-writer. Trap: "simultaneous writes in both Regions, Active-Active" has DDB Global Tables as its only direct answer, and the key distinction is that Aurora Global and Redis Global Datastore are both single-writer.

---

**Question 4.** In DynamoDB Global Tables, how is a conflict resolved when two Regions modify the same item almost simultaneously?

A) The two writes are merged automatically

B) The write with the later timestamp wins (Last Writer Wins)

C) Both writes are rejected

D) An administrator resolves it manually

**Answer: B**

Explanation: DynamoDB Global Tables resolves conflicts with Last Writer Wins (LWW): the write with the later timestamp becomes the final value, and the losing one silently disappears (lost update). It is simple and fast, but because of this limitation the best practice is to avoid the pattern of writing the same item in multiple Regions at the same time or to partition write keys by Region. A (automatic merge) is a more complex approach like CRDTs and is not DDB's default behavior, and C and D are not true. Trap: DDB Global Tables conflict resolution is Last Writer Wins, and understanding the lost update risk from simultaneous writes is the heart of Active-Active design.

---

**Question 5.** What is the most accurate reason Aurora's distributed storage can maintain write availability even through the failure of an entire AZ (loss of 2 copies)?

A) Because it stores the data concentrated in a single AZ

B) Because it keeps 6 copies across 3 AZs and uses a 4/6 write quorum

C) Because it waits for confirmation from all 6 copies on every write

D) Because it immediately promotes a standby instance

**Answer: B**

Explanation: Aurora keeps 6 copies across 3 AZs, and a write counts as successful when 4 of the 6 (4/6 quorum) confirm it and a read when 3 do (3/6 quorum). Even if an entire AZ (2 copies) dies, the remaining 4 copies can fill the 4/6 write quorum, so availability is maintained (the W+R>N quorum principle). A is the exact opposite, C is fully synchronous and negates the benefit of a quorum, and D is an instance failover, not the reason for storage availability. Trap: the key point is that Aurora's durability is "quorum-based," not "waiting synchronously for all copies."

---

**Question 6.** A team wants to replicate ElastiCache Redis across two Regions. Which statement about the characteristics of Redis Global Datastore is most accurate?

A) It is multi-master, with writes possible in all Regions

B) Only 1 Primary Region receives writes, and Secondary Regions are replicated read-only in under 1 second

C) It replicates using DynamoDB Streams

D) Replication is synchronous, so RPO is always 0

**Answer: B**

Explanation: Redis Global Datastore is a single-writer configuration where only 1 Primary Region receives writes and the Secondary Regions are read-only replicas, usually replicated with under 1 second of lag. A is confused with a characteristic of DynamoDB Global Tables (Redis Global Datastore is not multi-master), C is DDB's mechanism, and D is cross-Region asynchronous replication, so RPO is not 0. Trap: "Redis multi-Region replication" is Global Datastore but single-writer, and the key distinction is that multi-master is DDB Global Tables.

---
