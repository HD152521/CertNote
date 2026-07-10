# Day 2 - Aurora: The Relational Database AWS Redesigned From Scratch

When Aurora was announced at AWS re:Invent 2014, many DBAs were skeptical. "Isn't this just MySQL put on a managed platform?" was the sentiment. It's not. Look inside Aurora and the story is completely different. Amazon dismantled the fundamental constraint of traditional relational DB architecture — that storage is bolted to a single server — into a shared distributed storage layer. The difference this decision makes explains "why Aurora, being the same MySQL, is faster and safer."

## The Background of Aurora's Birth — The Limits of Traditional DB Architecture

Traditional MySQL RDS (including Multi-AZ) looks like this. A single Primary instance writes data to a single EBS volume. With Multi-AZ, that entire EBS dataset is replicated block-by-block to the Standby instance's EBS. Add a Read Replica and the data is rewritten again to each Replica's EBS via binlog. In the end, the data exists in N copies across N EBS volumes.

The problems with this structure: failover is slow. To switch to the Standby, you must confirm the Standby is fully up to date, promote it to the new Primary, and change DNS. Add 5 Read Replicas and the binlog must fan out from the Primary to 5 places. Storage expansion requires managing each instance's EBS separately.

Aurora's solution was to completely separate the storage layer. Decouple compute (the instance) from storage, and let a distributed storage cluster spanning multiple AZs handle storage. The instance only reads from and writes to this shared storage. This architecture was officially presented in Amazon's 2014 internal paper "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases" (SIGMOD 2017).

> 💡 **Related theory**: Aurora's compute-storage separation architecture opened a new paradigm for cloud databases. This design is in the same vein as Snowflake's "Virtual Warehouse + Cloud Storage" separation and Google Spanner's "Tablet server + Colossus storage" separation. Making compute close to stateless allows compute nodes to be added/removed/replaced quickly and independently of storage. It's a "Shared-Storage architecture," the opposite of the traditional "Shared-Nothing architecture" (where each node has its own storage).

## Shared Distributed Storage — The Meaning of 6 Copies and Quorum

Aurora storage is not concentrated in one AZ. It maintains a total of 6 copies spread across 3 AZs. Specifically, 2 copies in each AZ, for 6 total.

When a write occurs, it's considered committed once the write succeeds on 4 of these 6 copies. This is the "4/6 Quorum Write." Reads operate with a 3/6 Quorum. Once you understand the meaning of this Quorum system, you can see why Aurora keeps operating with no data loss even when an entire AZ is wiped out.

```
AZ-a                AZ-b                AZ-c
[Copy 1] [Copy 2]  [Copy 3] [Copy 4]  [Copy 5] [Copy 6]
   ↑         ↑         ↑        ↑         ↑         ↑
   ─────────────────────────────────────────────────
              Aurora distributed storage layer
   ─────────────────────────────────────────────────

Write: needs 4 of 6 responses (4/6 Quorum)
      → entire AZ-a failure (Copies 1,2 lost): 4 of Copies 3,4,5,6 respond → OK
      → AZ-a's Copy 1 + AZ-b's Copy 3 lost: 4 of Copies 2,4,5,6 → OK

Read: needs 3 of 6 responses (3/6 Quorum)
      → even losing an entire AZ, secure 3 of the remaining 4 → OK
```

The key benefit of this design: even if an Aurora instance (compute) fails, the storage stays perfectly alive. You just attach a new instance to the storage. Because the storage is already replicated, it can start immediately from the latest state without any "Redo Log replay." This is the fundamental reason Aurora failover is fast, within 30 seconds.

> 🔍 **Going deeper**: Communication between Aurora storage nodes transmits only the Redo Log, not entire data pages. The Writer instance sends changed data to the storage nodes in the form of Redo Log, and the storage nodes run the Redo themselves to update the data pages. Thanks to this "Log Applicator" design, network traffic decreases dramatically. This contrasts with traditional MySQL Multi-AZ, which replicates entire data blocks. In the SIGMOD 2017 paper, the Aurora team reported that this optimization reduced network I/O by 7.7×.

> 💡 **Related theory**: The 4/6 Quorum system implements the "Quorum-based Replication" theory from distributed systems. In Leslie Lamport's Paxos (1989) and Diego Ongaro's Raft (2014, USENIX ATC), a Quorum guarantees consistency through a majority principle. If you commit only when (n/2 + 1) of n copies agree, the system keeps working even if up to (n/2 - 1) nodes die simultaneously. Aurora's 4/6 is exactly this principle: 4 of 6 needed → tolerates up to 2 simultaneous losses.

## Aurora Endpoints — The Roles of 4 Types

An Aurora cluster has several kinds of endpoints, each used for a different purpose. The exam frequently asks "which endpoint should you use."

**Cluster Endpoint (Writer Endpoint)**: Always points to the current Writer instance. Used for writes and transaction processing. When a failover occurs, it automatically points to the new Writer.

**Reader Endpoint**: Load-balances across all Reader instances in the cluster. It selects a Reader in round-robin fashion for each incoming connection request. Used for distributing read traffic.

**Custom Endpoint**: An endpoint the DBA creates by designating a specific set of Readers. It enables separations like "analytics queries only on the 2 r5.8xlarge Readers" and "OLTP reads only on the 3 r5.2xlarge Readers."

**Instance Endpoint**: An endpoint that points directly to one specific instance. Used for debugging or special query routing. Not recommended for general operations.

```
App (write) ──────────────► Cluster Endpoint ──► Writer (AZ-a)
App (read) ───────────────► Reader Endpoint ────► Reader1 (AZ-b)
                                            ├──► Reader2 (AZ-c)
                                            └──► Reader3 (AZ-a)

Analytics team ───────────► Custom Endpoint ─────► Reader4 (r5.8xl, AZ-b)
                                            └──► Reader5 (r5.8xl, AZ-c)

                              ↑
                   Shared distributed storage (6 copies, 3 AZs)
```

> ⚠️ **Pitfall**: The Reader Endpoint load-balances at the connection level. That is, a routing decision is made each time a new connection opens. An already-open connection keeps the same Reader even if a failover occurs. So if "a connection-pooling library holds connections for a long time," imbalance among Readers can develop. In an RDS Proxy + Aurora combination, the Proxy mitigates this problem too.

## Aurora Global Database — Real-Time Replication Across Regions

Aurora Global Database is a feature that extends a single Aurora cluster across multiple regions. It consists of 1 Primary region and up to 5 Secondary regions.

Replication happens directly at the Aurora storage layer. Because it's storage-layer replication rather than DB-engine level (binlog, etc.), it doesn't use the DB instance's CPU, and replication lag is extremely short. Typically **sub-second replication lag (RPO < 1 second)** is achieved.

Secondary regions can be used read-only. If the Primary region goes completely down in a disaster, promoting a Secondary region to the new Primary achieves an RTO of **within 1 minute**.

| Aspect | Aurora Global DB | RDS Cross-Region Read Replica |
|--------|------------------|-------------------------------|
| Replication location | Storage layer | DB engine layer (binlog/WAL) |
| Replication lag | < 1 second | Seconds to tens of seconds |
| Number of Secondary regions | Up to 5 | Up to 5 (MySQL), several (PG) |
| Failover time | Within 1 minute | Minutes to tens of minutes (manual promote) |
| Secondary reads | Possible | Possible |
| Cost | Higher | Moderate |
| Engine | Aurora MySQL / Aurora PG | MySQL / PG / MariaDB / Oracle, etc. |

> 🔍 **Going deeper**: Aurora Global Database's Planned Failover and Unplanned Failover are different. **Planned Failover (Managed Planned Failover)** is used for maintenance or region migration; it first promotes the Secondary to the new Primary, then demotes the original Primary to Secondary. Data loss (RPO) in this process is nearly 0. **Unplanned Failover** is when you manually promote a Secondary on a Primary-region failure, and data corresponding to the replication lag may be lost (usually within a few hundred ms to 1 second).

> 📚 **Case study**: Samsung Electronics' B2B SaaS platform SmartThings processes hundreds of millions of IoT device events worldwide. In a domestic AWS customer case-study session (AWS Summit Seoul), the SmartThings team described a structure where users in the US, Europe, and Asia read device state from the nearest region's Aurora Secondary via Aurora Global Database. Because replication lag is under 1 second, users worldwide see almost identical, up-to-date state.

## Aurora Serverless v2 — The Real Meaning of Auto Scaling

Aurora Serverless v2 is a complete redesign of the earlier Serverless v1. On v1, capacity would drop to 0 and take 30-60 seconds to come back up, making practical use difficult. v2 changed the design itself.

Aurora Serverless v2 scales from **0.5 ACU (Aurora Capacity Unit) up to 256 ACU**. Since 1 ACU corresponds to roughly 2GB of RAM, auto scaling is possible up to 512GB of RAM. The scaling speed is on the order of seconds — revolutionary compared to v1's minutes.

Another characteristic of v2: it doesn't shut off completely to 0 ACU. It always maintains at least 0.5 ACU. There's a separate "auto-pause" feature (for dev/test environments), but in production you typically set a minimum value to prevent cold starts.

Suitable use cases:
- SaaS services with irregular traffic spikes (billing concentrated at month-start, spikes during event periods)
- Dev/test environments (automatically shrinking to the minimum at night for cost savings)
- New services whose traffic patterns are unknown

Unsuitable use cases:
- Stable workloads that must always sustain high throughput (Provisioned is cheaper)
- Cases needing peak performance at a specific ACU level (temporary delays can occur during scaling)

> 💡 **Related theory**: Serverless v2's scaling mechanism follows the "Resource Sharing on Multi-Tenant Infrastructure" principle. Physically, multiple Aurora Serverless v2 clusters share CPU and memory on a large server, but each cluster is completely isolated. Similar to Google's Borg/Kubernetes clusters, this approach raises physical resource utilization while maintaining logical isolation.

## Backtrack and Fast Clone — Two Ways to Recover Quickly

Two features unique to Aurora MySQL are Backtrack and Fast Clone.

**Backtrack**: Rewinds the cluster to a specific point in the past, as if rewinding a video. The difference from PITR is that PITR creates a new cluster, while Backtrack rewinds the current cluster itself. It completes within minutes. However, it's only supported on MySQL-compatible Aurora. PostgreSQL-compatible Aurora has no Backtrack — you must use PITR. The Backtrack window is up to 72 hours in the past.

```
PITR:      ────────────────────────────────►
                                           creates a new cluster (tens of minutes)

Backtrack: ◄────────────────────────────────
           rewinds the current cluster to the past (minutes)
```

**Fast Database Cloning**: Instantly clones an Aurora cluster using Copy-on-Write (COW). Initially it shares the source storage, creating new pages only when changes occur. As a result, you can clone a multi-TB database in minutes. It's used for dev/test environments, staging, and validation before large-scale migrations.

> ⚠️ **Pitfall**: On the exam, for a question like "you accidentally deleted data on an Aurora PostgreSQL cluster. How do you quickly restore it?", choosing Backtrack is wrong. PostgreSQL doesn't support Backtrack, and PITR is the answer. Backtrack becomes an option only when "Aurora MySQL" is explicitly stated.

## Aurora vs RDS — When to Choose Aurora

Aurora costs about 20% more than RDS MySQL/PostgreSQL. There are scenarios where this extra cost is justified, and scenarios where it isn't.

**Cases where Aurora is more suitable:**
- High-availability requirements where failover must be within 30 seconds
- Large read traffic needing 5 or more Read Replicas
- Global services needing < 1 second cross-region replication (Aurora Global DB)
- Services with rapidly fluctuating traffic (Aurora Serverless v2)
- Wanting to scale tens of TB or more with unlimited storage growth (Aurora Storage auto-expansion)

**Cases where plain RDS is more suitable:**
- Cost-sensitive small-to-medium workloads with stable traffic
- When the Oracle, SQL Server, or MariaDB engine is required (Aurora is only MySQL/PostgreSQL-compatible)
- When you need specific MySQL/PostgreSQL version features or plugins

| Aspect | RDS MySQL/PostgreSQL | Aurora MySQL/PostgreSQL |
|--------|----------------------|-------------------------|
| Storage | EBS per instance | Shared distributed (6 copies, 3 AZs) |
| Max storage | 64TB (gp3), 16TB (gp2) | Up to 128TB |
| Max Read Replicas | 5 | 15 |
| Replication lag | Asynchronous (seconds) | Tens of ms (shared storage) |
| Failover time | 60-120s | Within 30s |
| Global replication | Cross-Region Replica (async) | Global DB (storage-level, < 1s) |
| Serverless | None | v2 (0.5-256 ACU, second-scale) |
| Backtrack | None | MySQL-compatible only (72 hours) |
| Fast Clone | None | Yes (COW) |
| Cost | Baseline | About 20% higher |

> 📚 **Case study**: Netflix runs its global streaming service on AWS and replicates core data across multiple regions. According to its official engineering blog (Netflix Tech Blog), Netflix pursues an "Active-Active" multi-region strategy, and Aurora Global Database is one of its foundations. In particular, for globally read-heavy data like user profiles and subscription information, distributing reads to Secondary regions significantly reduced latency, they note.

## Actually Setting Up an Aurora Cluster via the CLI

```bash
# Create an Aurora MySQL cluster
aws rds create-db-cluster \
  --db-cluster-identifier prod-aurora \
  --engine aurora-mysql \
  --engine-version 8.0.mysql_aurora.3.05.2 \
  --master-username admin \
  --master-user-password 'StrongPass123!' \
  --storage-encrypted \
  --vpc-security-group-ids sg-xxx \
  --db-subnet-group-name aurora-subnet-group \
  --backup-retention-period 7

# Writer instance
aws rds create-db-instance \
  --db-instance-identifier prod-aurora-writer \
  --db-cluster-identifier prod-aurora \
  --engine aurora-mysql \
  --db-instance-class db.r6g.xlarge \
  --availability-zone ap-northeast-2a

# Reader instances x2 (different AZs)
aws rds create-db-instance \
  --db-instance-identifier prod-aurora-reader-1 \
  --db-cluster-identifier prod-aurora \
  --engine aurora-mysql \
  --db-instance-class db.r6g.xlarge \
  --availability-zone ap-northeast-2b

# Create an Aurora Global DB (Seoul → Virginia)
aws rds create-global-cluster \
  --global-cluster-identifier prod-global-aurora \
  --source-db-cluster-identifier arn:aws:rds:ap-northeast-2:111:cluster:prod-aurora

# Enable Backtrack (MySQL-compatible only)
aws rds modify-db-cluster \
  --db-cluster-identifier prod-aurora \
  --backtrack-window 4320   # 72 hours = 4320 minutes

# Aurora Serverless v2 cluster
aws rds create-db-cluster \
  --db-cluster-identifier dev-aurora-serverless \
  --engine aurora-mysql \
  --engine-version 8.0.mysql_aurora.3.05.2 \
  --master-username admin \
  --master-user-password 'StrongPass123!' \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=16

aws rds create-db-instance \
  --db-instance-identifier dev-aurora-serverless-instance \
  --db-cluster-identifier dev-aurora-serverless \
  --engine aurora-mysql \
  --db-instance-class db.serverless
```

## Wrapping Up

Aurora is a service that keeps the exterior of a relational DB while completely redesigning the internal storage architecture. Its 6-copy distributed storage and 4/6 Quorum write protect data even against the total loss of one AZ, and compute-storage separation enables fast failover and easy Reader additions. Aurora Global Database achieves sub-second cross-region lag through storage-layer replication, and Serverless v2 adjusts capacity in seconds.

From an exam perspective: when you see "5 or more Read Replicas," "failover within 30 seconds," "< 1 second cross-region replication," or "auto-scaling for fluctuating traffic," the Aurora family is the answer. Be sure to remember that "Backtrack" is Aurora MySQL-only, and "PostgreSQL uses PITR" only.

Tomorrow we cover the schema-less world, DynamoDB. We'll see why the partition key matters so much, how a Hot Partition can kill a system, and what 1 RCU = 4KB really means.

---

## 📝 연습 문제

**문제 1.** A financial services company needs fast access to the same DB data from 3 regions — the US (us-east-1), Europe (eu-west-1), and Seoul (ap-northeast-2) — for a global application. Data consistency tolerates sub-second lag. What is the most suitable solution?

A) Place independent RDS MySQL instances in each region and synchronize from the application
B) Set up Aurora Global Database with us-east-1 as Primary and configure eu-west-1 and ap-northeast-2 as Secondaries
C) Place RDS MySQL in us-east-1 and create a Cross-Region Read Replica in each region
D) Use DynamoDB Global Tables

**정답: B**
해설: Aurora Global Database achieves sub-second cross-region replication lag via storage-layer replication. It supports up to 5 Secondary regions, so a 3-region setup is more than sufficient. A struggles to guarantee data consistency. C's RDS Cross-Region Read Replica has a replication lag of seconds to tens of seconds, longer than Aurora Global DB. D is NoSQL, so it may be unsuitable for a financial service that requires a relational schema.

---

**문제 2.** On an Aurora MySQL cluster, an operator accidentally ran a bad DELETE query and important data was deleted. A few minutes have already passed. What is the fastest way to restore the current cluster to its pre-deletion state?

A) Restore a new cluster from the most recent snapshot (expected 20 minutes)
B) Use Aurora Backtrack to rewind the current cluster to the point before deletion (a few minutes)
C) Promote a Read Replica to Primary and manually restore the deleted data
D) Create a new cluster with PITR to just before the deletion (15-20 minutes)

**정답: B**
해설: Backtrack is an Aurora MySQL-only feature that quickly rewinds the current cluster to a past point (within minutes). Since you don't need to create a new cluster, no endpoint change is needed either. A and D require creating a new cluster, so they take longer and require endpoint-switching work. C is wrong because a Read Replica also receives write replication, so the delete would have been replicated too — the data is already gone from the Replica.

---

**문제 3.** A startup is about to launch a new SaaS service. The traffic pattern is hard to predict, and traffic is expected to fluctuate sharply for the first several weeks after launch. It wants to automatically adjust capacity while minimizing cost. What is the most suitable Aurora option?

A) Aurora MySQL Provisioned (fixed db.r6g.large)
B) Aurora Serverless v1 (can pause completely at a minimum of 0 ACU)
C) Aurora Serverless v2 (minimum 0.5 ACU, second-scale scaling)
D) Aurora MySQL + Auto Scaling Read Replicas

**정답: C**
해설: Aurora Serverless v2 auto-scales in seconds across the 0.5-256 ACU range, responding quickly to traffic fluctuations. v1 scales slowly (minutes) and has connection-drop issues during scaling, making it unsuitable for production. A is fixed capacity and can lead to waste or shortfalls. D scales reads but does not auto-adjust write capacity.

---

**문제 4.** Two of an Aurora cluster's 6 copies are lost simultaneously (Copy 5 and Copy 6 in AZ-c). What is the impact on the cluster's read/write operation?

A) The cluster stops completely
B) Only writes work; reads stop
C) Both writes and reads keep operating normally
D) Only reads work; writes stop

**정답: C**
해설: Aurora storage commits writes with a 4/6 Quorum and serves reads with a 3/6 Quorum out of 6 copies. If Copies 5 and 6 are lost, Copies 1, 2, 3, 4 remain. Writes: 4/6 → 4 of 4 responses is sufficient (OK). Reads: 3/6 → 3 of 4 responses is sufficient (OK). Therefore the cluster keeps operating normally. Note that Aurora automatically regenerates the lost copies in the background (self-healing).

---

**문제 5.** An application performs both writes and reads on an Aurora cluster. The operations team wants to reserve 2 specific Reader instances exclusively for analytics queries (separating OLTP reads from analytics reads). Which Aurora feature implements this?

A) Create 2 Reader Endpoints
B) Create a Custom Endpoint and designate the analytics Reader instances
C) Use Instance Endpoints directly
D) Migrate to Aurora Serverless v2

**정답: B**
해설: A Custom Endpoint is a feature that groups specific Reader instances in a cluster into a separate endpoint. If the analytics team uses the Custom Endpoint and the OLTP app uses the Reader Endpoint, the traffic is completely separated. A is impossible — there is one Reader Endpoint per cluster. C directly designates only one specific instance, so it has no load balancing and becomes a single point of failure. D is unrelated to this problem.

---
