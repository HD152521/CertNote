# Day 1 - Multi-AZ High Availability: Distributed Principles Underlying Replication Consistency, Quorum, and Failover

When you look seriously at database availability, you always arrive at the same question. "I just committed data. To not lose it even if one server dies, someone else must hold a copy. When, how many, and where do we place that copy?" The answers branch at the juncture of **synchronous vs. asynchronous replication**, **single-AZ vs. multi-AZ**, **2-copy vs. 6-copy quorum**. AWS's RDS Multi-AZ, Aurora, and ElastiCache appear as simple checkboxes for "HA option," but underneath lie decades of distributed-systems theory — replication, consensus, quorum, CAP — from the 1970s onward. Today we excavate what tradeoffs these checkboxes make, why Aurora chose a fundamentally different storage design than traditional replication, and where failover time (RTO) is determined.

In DOP exams, Multi-AZ is foundational to "operational excellence and resilience," appearing repeatedly in scenarios like "cut RTO from 60s to 30s," "distribute read load while guaranteeing HA," or "prevent application connection drops during failover." Recognizing which tool touches synchronous/asynchronous, quorum, or endpoint reveals the answer.

## Replication is Hard — The Fundamental Tension Between Sync and Async

Replication's essence is simple: store the same data in multiple places. But when do you respond "write complete" to the client? Here everything diverges.

**Synchronous replication** waits until all (or a quorum) of replicas acknowledge receipt and disk write before acknowledging commit to the client. **Asynchronous replication** writes to the primary only, responds immediately, then propagates to replicas in the background.

This difference becomes **RPO** (recovery point objective: how much data can we lose?). Synchronous targets RPO=0 — if the primary dies, standby already has the same data. But every write waits one extra network round-trip, increasing write latency. Asynchronous is fast, but if the primary dies before propagating, uncommitted transactions vanish forever (RPO > 0).

> 💡 **Related theory**: This tension is formalized by **CAP Theorem** (Eric Brewer, 2000 PODC keynote; Gilbert & Lynch formal proof, 2002) and its refinement **PACELC** (Daniel Abadi, 2012). CAP says "during network Partition, choose Consistency or Availability." PACELC adds a line: "Else (no partition), choose Latency or Consistency." RDS Multi-AZ's synchronous replication is PC/EC (Consistency first, accept Latency); DynamoDB Global Tables' asynchronous is PA/EL (Availability·Latency first, sacrifice Consistency). "One checkbox" is actually choosing position on this fundamental coordinate.

> 🔍 **Going deeper**: RDS Multi-AZ's "synchronous replication" is precisely **physical, block-level replication**, not logical replication (binlog-based, SQL statement/row level) like MySQL. It mirrors disk blocks below the storage engine directly (similar to DRBD — Distributed Replicated Block Device). So Standby is byte-for-byte identical to Primary, which is why Standby cannot run reads — it's not "a readable replica," but "a shadow disk acting independently." Read Replicas, by contrast, use **logical asynchronous replication** (binlog/WAL) and run their own query engine, accepting reads. This physical-vs-logical distinction is the real answer to "why can't Multi-AZ Standby read but Read Replica can?"

## RDS Multi-AZ — Synchronous Mirror and Automatic Failover

Traditional RDS Multi-AZ places one Primary and one Standby in different AZs. All writes happen at Primary and sync to Standby. Standby receives no traffic in normal times — neither reads nor writes. Backups and OS patches run on Standby to spare Primary's I/O burden.

Failover is detected and executed automatically by RDS. Triggers include Primary failure, AZ failure, instance type change, OS patching. The key: **the endpoint (DNS name) persists** — RDS changes the IP that the DNS record points to the new Primary (promoted old Standby). Clients reconnect to the same hostname. This process normally takes 60–120 seconds.

> ⚠️ **Pitfall**: Even if failover is fast, if the client's **DNS cache TTL is long**, recovery feels slow. If the application or JVM caches DNS results indefinitely (infamous Java `networkaddress.cache.ttl=-1` infinite cache), even after the endpoint IP changes, clients keep connecting to the dead old IP. That's why RDS endpoints run with short TTLs, and application-side DNS caches must also be short. In exams, the answer to "failover completed but app still connects to old node" is almost always "DNS cache TTL" or "connection pool reusing dead connections."

## RDS Multi-AZ DB Cluster — 2-Copy to 3-Copy Semi-Sync

In 2022, AWS released **Multi-AZ DB Cluster**, a variant. Structure differs — 1 Writer + 2 Readable Standby across 3 AZs. Both Standby can **accept reads**, and replication is **semi-synchronous**: commit when *at least one* of the two Standbys acknowledges, not both. Semi-sync is faster than full sync (wait for both), safer than async (wait for no one).

The payoff is failover speed — **under 35 seconds** versus traditional Multi-AZ's 60–120s. Already-running Readable Standby candidates await promotion without boot time.

> 💡 **Related theory**: Semi-synchronous replication's "acknowledge on one of two" embodies **quorum** thinking. In distributed systems, quorum means "majority consensus," a core technique to achieve both availability and consistency. If write quorum (W) and read quorum (R) satisfy `W + R > N` (total replicas), any read will encounter at least one replica with the latest write, guaranteeing strong consistency (Dynamo paper, 2007). Semi-sync Multi-AZ DB Cluster simplifies this insight for managed RDS; the full quorum storage story begins with Aurora next.

## Aurora — Push Replication Down to Storage Layer

Aurora is AWS's product but opposite philosophy from RDS. Traditional databases "compute owns replication" — Primary sends data to Standby. Aurora inverts this. **It pushes replication down to the storage layer.** Aurora compute nodes (Writer/Reader) have no local disk. Instead, all share one **cluster volume**, which stores data in 6 copies across 3 AZs.

```
Aurora Cluster
   ├─ Writer Node (1)              ← Write-only
   ├─ Reader Nodes (0-15)          ← Read-distributed, share cluster volume with Writer
   └─ Cluster Volume (Shared Storage)
        6 copies / 3 AZ (2 per AZ)
        4/6 write quorum, 3/6 read quorum
```

The key: quorum numbers. Writes succeed when 6 replicas confirm 4 (4/6 write quorum); reads need only 3 (3/6 read quorum). Since `W(4) + R(3) = 7 > N(6)`, quorum intersection is guaranteed — any read includes the latest write.

Why this 6/3/2 design emerged is the heart of the Aurora paper (Verbitski et al., SIGMOD 2017 *"Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"*). If one AZ dies entirely (2 copies lost), the remaining 4 copies satisfy the 4/6 write quorum; still writable. If that AZ stays dead and one more copy fails (3 total lost), the remaining 3 copies satisfy the 3/6 read quorum — still readable. This is **"AZ+1" fault model** — an entire AZ failure plus an extra disk failure leaves no data loss.

> 🔍 **Going deeper**: Why traditional DB replication is slow: **full-page writes** over network. MySQL writes double-write buffer, binlog, redo log, data pages to both disk and replicas (write amplification). Aurora's insight: "**the log is the database**" — Writer sends not full data pages but **only redo log records** to storage. Heavy page materialization is done asynchronously in the background by storage nodes. Network write traffic shrinks by orders of magnitude, achieving higher throughput on same hardware vs. traditional MySQL. This is why "Aurora is MySQL/PostgreSQL compatible but faster" — same query engine, but storage/replication layer completely rewritten.

> 📚 **Case study**: Netflix suffered a 2008 single-datacenter storage corruption causing DVD shipment shutdown for three days, sparking company-wide commitment to "eliminate single points of failure, embrace cloud-distributed storage" (precursor to Chaos Monkey). Aurora's 6-copy/3-AZ design products exactly this lesson — "assume storage always partially fails; design quorum to survive" — into managed service. Lesson: HA is not "prevent failures"; it's "design quorum to continue despite failures."

## Aurora Failover and Added Features

When Aurora Writer dies, one of the live Readers promotes to Writer based on tier priority. Since storage is shared, no data copy needed — **failover under 30 seconds** (longer if no Reader exists and new one must boot). **Reader endpoint** is a load-balancing entry point across all Readers; **Writer endpoint** always points to current Writer.

| Feature | Core | Remark |
|---------|------|--------|
| **Backtrack** (MySQL) | Rewind cluster to specific point-in-time | Without S3 backup, up to 72-hour window, in-place |
| **Cluster Volume auto-expand** | Auto-scale to 128TB in 10GB increments | No pre-provisioning needed |
| **Aurora Serverless v2** | Scale 0.5 ACU units continuously | Auto-adjust with traffic |
| **Global Database** | 1 Primary + up to 5 Secondary regions | Async <1s lag (Day 2) |

> ⚠️ **Pitfall**: Backtrack differs from backup (snapshot restore). Backtrack **rewinds the cluster in-place to past time** (no new cluster created), works only for MySQL-compatible, and rewinds only changes after activation. "Oops, DELETE — rewind 5 minutes" = Backtrack (fast), but "restore one deleted table" or "state 30 days ago" = PITR (point-in-time recovery, snapshot+logs). Mixing them is an exam trap.

## RDS Proxy — Hide Failover from Client

Even 30-second failover can cause hundreds of app connections to drop and simultaneously attempt reconnect, overwhelming new Primary (connection storm). **RDS Proxy** is a managed proxy placing a connection pool between client and DB. Clients connect to Proxy; Proxy pools and reuses DB connections.

During failover, client-Proxy connection persists; Proxy internally switches routing to new Primary. Client sees almost no disconnection. Additional benefits: IAM auth integration, Secrets Manager tie-in, and mitigating connection spikes from serverless (Lambda).

> 💡 **Related theory**: RDS Proxy's connection pooling is no new invention — decades old pattern. Java's HikariCP/c3p0, PgBouncer (PostgreSQL connection pooler) do the same. DB connections are expensive resources consuming memory and processes (PostgreSQL spawns one process per connection), so "new connection per request" is an anti-pattern. Pooling is the **object pool** pattern reused. Thousands of concurrent Lambda invocations each opening connections would exhaust DB's `max_connections` instantly; RDS Proxy multiplexes these connections to prevent it. That's why RDS Proxy is quasi-mandatory for serverless+RDS.

## ElastiCache Redis — Cache High Availability

ElastiCache for Redis (now including Valkey) HA operates at **replication group** level. One Primary and 0-5 Replicas form a group; Primary dies, one Replica auto-promotes (Multi-AZ required).

- **Cluster Mode Disabled**: Single shard (1 Primary + max 5 Replica). Entire dataset fits in one node; Replicas for read distribution and HA. Use when dataset fits in single-node memory.
- **Cluster Mode Enabled**: Multiple shards (up to 500) **partition** data, each shard owns Primary+Replica. Use when data exceeds single-node memory or write scale-out needed.

> 🔍 **Going deeper**: Cluster Mode Enabled's sharding uses **hash slot** method, cousin to consistent hashing. Redis Cluster divides keyspace into 16,384 slots (`CRC16(key) mod 16384`), assigns each slot to shard. Adding/removing shard only rehashes those slots, avoiding naive modulo's disaster (hash mod N, change N → nearly all keys move). Consistent hashing's core value — "minimize moved keys when node count changes" — is exactly here. ElastiCache performs slot redistribution online (zero-downtime), called resharding.

## Failover RTO At a Glance — What Determines Time?

| Config | RTO | RTO Determined By |
|--------|-----|-------------------|
| RDS Single-AZ | Manual (min-hours) | Human restores snapshot |
| RDS Multi-AZ | 60–120s | Standby promotion + DNS flip |
| RDS Multi-AZ DB Cluster | <35s | Pre-running Readable Standby promotion |
| Aurora (single region) | <30s | Shared storage, no copy needed; Reader promote |
| Aurora Global (region failover) | <1min | Secondary promote to standalone (Day 2) |
| ElastiCache Redis Multi-AZ | <60s | Replica promotion |
| DynamoDB | ~0 | Inherently distributed, no single-node concept |

One principle threads the table: **"Faster RTO: shorter promotion candidate exists, no data copy needed."** Aurora's 30s comes from shared storage (new Writer needs no data); Multi-AZ DB Cluster beats traditional Multi-AZ because Standby already runs reads. 

## Wrapping Up

Today we covered four things. First, **replication is an RPO-latency tradeoff between sync and async**, positioned on CAP/PACELC's fundamental coordinate. Second, **RDS Multi-AZ is block-level synchronous mirror** (Standby cannot read); **Read Replica is logical asynchronous** (reads OK, separate endpoint) — difference stems from physical vs. logical replication. Third, **Aurora pushes replication to storage**: 6-copy/3-AZ quorum (4/6 write, 3/6 read, "AZ+1" fault model) and "log-is-database" design surpass traditional databases. Fourth, **RTO determined by promotion candidate existence and data-copy necessity**; RDS Proxy hides failover from client via connection pooling.

Next article extends HA **beyond single region to multi-region** — Route 53 routing, Aurora Global, DynamoDB Global Tables, KMS Multi-Region Keys.

---

## 📝 Practice Questions

**Question 1.** What is the fundamental reason you cannot send read queries directly to the Standby instance in traditional RDS Multi-AZ?

A) The Standby is in a different Region

B) Multi-AZ uses block-level physical replication, so the Standby behaves like a shadow of the same disk rather than an independent query engine

C) AWS intentionally blocks it to save cost

D) The Standby uses asynchronous replication, so its data is stale

**Answer: B**

Explanation: The synchronous replication of traditional RDS Multi-AZ is physical, block-level replication that mirrors disk blocks below the storage engine (similar to DRBD). The Standby is merely a "shadow disk" byte-for-byte identical to the Primary and does not run its own query processing engine, so it cannot accept reads. A Read Replica, by contrast, uses logical asynchronous replication based on the binlog/WAL, so it has its own query engine and can serve reads — this difference between physical and logical replication is the answer to "why can't a Multi-AZ Standby serve reads while a Read Replica can." Region (A), cost (C), and replication lag (D) are not the essence.

---

**Question 2.** An Aurora cluster volume spreads 6 copies across 3 AZs and uses a 4/6 write quorum and a 3/6 read quorum. What fault tolerance does this design guarantee?

A) Writes remain possible even if all AZs die at the same time

B) An "AZ+1" failure model: writes remain possible even if an entire AZ dies (2 copies lost), and reads remain possible even if one more copy dies on top of that (3 lost in total)

C) A guarantee that disk failures never occur

D) Writes are possible with a single copy alone

**Answer: B**

Explanation: With 6 copies placed 2 per AZ across 3 AZs, if an entire AZ dies, 2 copies are lost, but the remaining 4 copies satisfy the 4/6 write quorum so writes continue. Even if one more copy dies in that state, for a total of 3 copies lost, the remaining 3 copies satisfy the 3/6 read quorum and reads are maintained. This is called the "AZ+1" failure model. Because `W(4)+R(3)=7 > N(6)`, quorum intersection is guaranteed and consistency is maintained as well. All AZs dying at once (A) or writing with a single copy (D) does not fit the quorum math, and it is not that disk failures never occur (C) but that the design tolerates them when they do.

---

**Question 3.** What is the key mechanism by which Aurora achieves higher write throughput than traditional MySQL on the same hardware?

A) Aurora uses only faster memory instead of SSD

B) The writer sends only redo log records, not full data pages, to storage ("the log is the database"), and the storage nodes reconstruct pages asynchronously, greatly reducing network write volume

C) Aurora rewrote the query engine from scratch, so SQL is faster

D) Because Aurora does not perform replication

**Answer: B**

Explanation: A traditional DB writes data pages, the redo log, the binlog, and the double-write buffer, causing large write amplification, and sends heavy pages to replicas over the network. Aurora's insight is "the log is the database": the writer sends only the changed redo log records to the storage layer, and the storage nodes perform page materialization in the background. The data flowing over the network shrinks significantly and throughput rises (the Aurora SIGMOD 2017 paper). The query engine is still MySQL/PostgreSQL, so C is wrong (only the storage and replication layers were newly written), and it is not that replication is skipped (D) but that it does 6-copy replication.

---

**Question 4.** Even after an RDS Multi-AZ failover has completed, the application keeps trying to connect to the dead old node. What is the MOST likely cause?

A) The new Primary has a different endpoint name

B) The application/JVM DNS cache TTL is too long, or the connection pool is reusing dead connections

C) Multi-AZ did not work

D) RDS did not change the IP

**Answer: B**

Explanation: An RDS failover keeps the endpoint DNS name and changes the IP that the record points to the new Primary. Therefore the endpoint name stays the same (A is wrong) and the IP changes (D is wrong). However, if the application or the JVM caches DNS results for a long time (for example, Java's infinite DNS cache), it keeps connecting to the old IP, and the same symptom occurs if the connection pool reuses broken connections without validation. The fix is a short DNS TTL, shortening the client DNS cache, connection validation checks, or using RDS Proxy to hide the failover from clients.

---

**Question 5.** A serverless (Lambda) application exhausts RDS max_connections during traffic spikes, producing "too many connections" errors. What is the standard solution?

A) Scale up the DB instance type indefinitely

B) Place an RDS Proxy to pool and multiplex connections, and keep client connections even during failover

C) Limit Lambda concurrency to 0

D) Add a Read Replica

**Answer: B**

Explanation: Lambda opens its own DB connection in each concurrent execution environment, so a traffic spike exhausts max_connections almost instantly. RDS Proxy pools and multiplexes connections between clients and the DB, holding down the actual number of DB connections, and keeps client connections during failover to reduce disconnections. This is a managed implementation of connection-pool patterns such as PgBouncer/HikariCP, and is practically essential in serverless + RDS combinations. Scaling up the instance (A) is not a root-cause fix, concurrency 0 (C) is a service outage, and a Read Replica (D) distributes reads but does not prevent the connection surge itself.

---

**Question 6.** A bulk DELETE was run by mistake, and you want to rewind the entire Aurora MySQL cluster to its state 5 minutes ago as fast as possible. Which is MOST suitable?

A) Rewind the cluster in place to 5 minutes ago with Aurora Backtrack

B) Restore from a snapshot to a new cluster

C) Promote a Read Replica

D) Restore from an S3 backup

**Answer: A**

Explanation: Aurora Backtrack (MySQL-compatible) rewinds the cluster itself in place to a specific point in time without creating a new cluster, and works quickly within a window of up to 72 hours. It is the fastest for "undo a mistake I just made by a few minutes." Snapshot restore (B) or PITR creates a new cluster and brings the data over, so it is slow and requires swapping endpoints. However, the pitfalls are that Backtrack can rewind only changes made after it was enabled and that it does not exist for PostgreSQL. For "only a specific table" or "30 days ago," PITR is the right choice.

---

**Question 7.** In ElastiCache for Redis, the dataset exceeds a single node's memory and writes must be distributed horizontally. What is the correct configuration and its internal mechanism?

A) Cluster Mode Disabled, adding only Replicas

B) Cluster Mode Enabled shards data across 16384 hash slots, each shard has its own Primary+Replica, and because of the slot approach the keys moved during resharding are minimized

C) Only scale vertically to a larger single node

D) Switch to RDS Multi-AZ

**Answer: B**

Explanation: Cluster Mode Enabled divides the key space into 16384 hash slots (`CRC16(key) mod 16384`) and distributes (shards) them across multiple shards, so it handles data exceeding a single node's memory and horizontal write distribution. Each shard also has HA through its own Primary+Replica. Hash slots share the idea of consistent hashing, so when shards are added or removed only slots are reassigned and moved keys are minimized (avoiding the mass key movement of naive `hash mod N`). Cluster Mode Disabled (A) is a single shard and cannot distribute data, vertical scaling (C) runs into the single-node limit, and RDS (D) is not a cache.

---

## 📌 Today's Summary

There are four key takeaways today. First, replication is an RPO-latency trade-off between synchronous and asynchronous, and sits on the CAP/PACELC coordinates — RDS Multi-AZ synchronous is PC/EC, while asynchronous replication prioritizes latency and availability. Second, RDS Multi-AZ is block-level physical replication (the Standby cannot serve reads) and Read Replicas are logical asynchronous replication (readable), so the behavioral difference comes from physical vs logical replication, and a Multi-AZ DB Cluster delivers failover in under 35 seconds with semi-synchronous 3-copy replication. Third, Aurora pushes replication down into storage and outperforms traditional DBs with a 6-copy/3-AZ quorum (4/6 write, 3/6 read, the AZ+1 failure model) and the "the log is the database" design, along with extras such as Backtrack, automatic scaling, and Serverless v2. Fourth, RTO is determined by the existence of a promotion candidate and whether data must be copied (Aurora 30 seconds, shared storage), and RDS Proxy's connection pooling hides failover from clients and prevents the connection surge from serverless.
