# Day 4 - Aurora: The Story of How AWS Rewrote the Storage Layer of an RDBMS

When Aurora was first unveiled at re:Invent 2014, it left many people puzzled. "MySQL-compatible, but not MySQL" was an awkward phrase. AWS's message was clear: **the SQL engine code is nearly the same MySQL/PostgreSQL code, but the storage, replication, and transaction layers underneath were redesigned from scratch for the cloud environment**. The result of that decision is numbers like "5x the performance of MySQL, 3x that of PostgreSQL + auto-scaling storage + sub-second cross-Region replication."

On DVA-C02, Aurora is asked about from a different angle than RDS. RDS asks about "the trade-offs of a managed DB," while Aurora asks "why is RDS not enough, and in which scenarios should you pick Aurora?" To understand the answer, you need to know Aurora's storage structure and quorum-based replication. Today we look inside.

## The Birth of Aurora: "The Essence of a Database Is Storage"

Traditional MySQL/PostgreSQL was designed assuming a 1990s single-server environment. It writes the binlog/WAL to disk, backups copy that disk, and replication sends the binlog to another server. Moving this model to the cloud as is brings these limitations along: ① it depends on a single EBS volume, so it is vulnerable to a single-AZ failure; ② replication is asynchronous and binlog-based, so lag occurs; ③ storage expansion is manual; ④ backup/restore takes time proportional to instance size.

The core insight of the Aurora paper (SIGMOD 2017, "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases," Verbitski et al.) was simple: **"The network is the new bottleneck. Therefore reducing network traffic is performance."** A traditional DB, at commit time, writes the same data to disk in several forms: ① data pages, ② undo log, ③ redo log, ④ binlog, ⑤ double-write buffer, and so on. According to AWS measurements, MySQL performs about 7.4 disk I/Os per commit.

Aurora sends only the redo log to the distributed storage, and the storage nodes handle page reconstruction in the background. As a result, the I/O count dropped to about one-sixth and network traffic dropped by 7.7x.

```
Commit in ordinary MySQL:
  Application → MySQL
                  ↓
              Local disk writes (data page, redo log, undo log, binlog, double-write...)
                  ↓
              Binlog-based replica replication (asynchronous)

Commit in Aurora:
  Application → Aurora
                  ↓
              Send only the "redo log record" to 6 storage nodes
                  ↓
              Commit completes once 4 of 6 ack
              (storage nodes reconstruct data pages in the background)
```

An Aurora storage node is not a simple EBS volume. It is **a small server that can receive redo logs and reconstruct pages**. An Aurora storage node appends incoming log records to its own local disk and builds page versions with that log applied. When a read request asks for "this page's version as of a specific LSN," the storage node responds immediately.

Thanks to this structure: ① the binlog disappears; ② replicas have no storage of their own and reference the same storage as the primary; ③ backup is effectively free (continuous backup); ④ storage expansion is automatic (segments of 10 GB are added/removed). This is the source of Aurora's differentiation.

## 6 Copies × 3 AZs + Quorum: "Survives Any Combination of Failures"

The representative picture explaining Aurora storage is "6 copies across 3 AZs." This number was not chosen arbitrarily; it is **a value derived from the mathematics of fault tolerance in distributed systems**.

```
3 AZ × 2 copies = 6 copies

Write quorum: V_w = 4 (commit once 4 of 6 copies ack)
Read quorum: V_r = 3 (a read from 3 of 6 copies is valid)

V_w + V_r > N (4 + 3 > 6) → guarantees strong consistency
2 × V_w > N (8 > 6) → prevents concurrent write conflicts
```

What this configuration guarantees:

- **Loss of 1 AZ + 1 additional node = reads still possible** (the remaining 3 copies satisfy V_r)
- **Loss of an entire AZ = writes still possible** (the remaining 4 copies satisfy V_w)
- **Loss of 2 AZs = no data loss** (the remaining 2 copies can be used for recovery)

Aurora's (N=6, W=4, R=3) was chosen to withstand AZ-level failures and node-level failures together.

## Aurora Replicas: Millisecond-Level Replication from Shared Storage

With an RDS Read Replica, each replica has its own storage, receives the primary's binlog, and applies it to its own disk. The limitations of this model are: ① storage cost is incurred for each replica; ② lag depends on binlog transfer + apply speed (usually several seconds to tens of seconds); ③ adding a replica takes time for the initial sync.

An Aurora Replica **has no storage of its own**. It shares the same distributed storage as the primary. So:

- **Replication lag is usually much less than 100 ms** (the docs' wording; it grows under heavy write load)
- **A new replica is usable immediately** (no storage copy)
- **Scales up to 15** (RDS MySQL/PG/MariaDB also allow up to 15 per source)
- **You pay only for instances** (no duplicated storage cost)

| Dimension | RDS Read Replica | Aurora Replica |
|------|------------------|----------------|
| Storage | Each has its own | Shared |
| Replication mechanism | Asynchronous binlog/WAL | Redo log notification (storage is shared) |
| Replication lag | Seconds to minutes | Usually much less than 100 ms |
| Max count | 15 per source (MySQL/PG/MariaDB/SQL Server) | 15 |
| Initial sync | Full copy required | Immediate |
| Failover time | Manual promote (minutes) | Automatic (typically under 60 seconds, often under 30) |

> ⚠️ **Pitfall**: The fast Aurora Replica failover (typically under 60 seconds, often under 30) applies **when the instance class is the same**. If there is a replica with an instance class different from the primary, its failover priority drops, and performance can degrade after failover. The cause in an "Aurora performance degradation after failover" scenario can be a replica instance size mismatch. You can specify the failover order with **Tier 0-15** priorities.

## The 5 Aurora Endpoint Types: Tools for Deciding Where to Connect

Unlike RDS, Aurora defaults to **cluster-level endpoints** rather than instance-level endpoints. You must distinguish the 5 types.

| Endpoint | DNS form | Role |
|-----------|---------|------|
| **Cluster Endpoint (Writer)** | `myclu.cluster-xxxx.region.rds.amazonaws.com` | Automatically routes to the current primary (updated automatically on failover) |
| **Reader Endpoint** | `myclu.cluster-ro-xxxx.region.rds.amazonaws.com` | DNS round-robin across all read replicas (load balancing) |
| **Custom Endpoint** | `myclu-analytics.cluster-custom-xxxx...` | A user-specified group of instances (for example, only the large replicas for analytics workloads) |
| **Instance Endpoint** | `myinst-1.xxxx.region.rds.amazonaws.com` | A specific instance directly (for operational debugging) |
| **Global Database Writer** | Issued automatically | The same endpoint in every Region of the Global DB, automatically routed to the writer in the primary Region |

Reader Endpoint load balancing happens at the **DNS level**. Resolving the same endpoint returns a different replica IP each time (TTL 5 seconds). This causes two problems.

- If a client keeps a connection open, that connection is pinned to one replica. If the connection pool is small, the load isn't distributed evenly.
- A stub resolver that caches DNS (the Java DNS default cache is infinite) doesn't refresh.

In practice you need one of: ① short connection lifetimes; ② Aurora client libraries (MariaDB Connector/J Aurora cluster aware, the Aurora Postgres JDBC wrapper); ③ delegating routing to RDS Proxy. The cause in a scenario such as "I used the Reader Endpoint but the load concentrates on one replica" is persistent connections + DNS caching.

```python
# In practice: isolate analytics workloads with a custom endpoint
ANALYTICS_ENDPOINT = "myclu-analytics.cluster-custom-xxxx.region.rds.amazonaws.com"
OLTP_READER_ENDPOINT = "myclu.cluster-ro-xxxx.region.rds.amazonaws.com"
WRITER_ENDPOINT = "myclu.cluster-xxxx.region.rds.amazonaws.com"

def get_analytics_conn():
    return pymysql.connect(host=ANALYTICS_ENDPOINT, ...)

def get_oltp_read_conn():
    return pymysql.connect(host=OLTP_READER_ENDPOINT, ...)

def get_write_conn():
    return pymysql.connect(host=WRITER_ENDPOINT, ...)
```

## Aurora Serverless v2: The Secret of ACUs

Aurora Serverless automatically scales compute capacity up and down with traffic. The unit is the **ACU (Aurora Capacity Unit)**: 1 ACU ≈ 2 GB of memory plus the corresponding CPU/network. The differences between v1 and v2 appear on the exam.

| Item | Aurora Serverless v1 (legacy) | Aurora Serverless v2 (recommended) |
|------|------------------------------|------------------------------|
| Scaling unit | Doubling jumps (2→4→8 ACU) | Fine-grained 0.5 ACU steps |
| Scaling speed | Minutes | Seconds |
| Min Capacity | 1 ACU (or paused) | 0 ACU (auto-pause) ~ 0.5 ACU |
| Max Capacity | — | 256 ACU (Aurora MySQL) / 384 ACU (Aurora PostgreSQL), depending on platform version |
| Cold start | ~30 seconds for the first request after pause | Scaling is non-disruptive; resuming from auto-pause (0 ACU) takes about 15 seconds (30 s or more after 24 h paused) |
| Multi-AZ | Optional | Standard |
| Data API | ✅ | ✅ (since 2023) |
| New use | Being deprecated | Recommended |

The biggest difference between v1 and v2 is the **scaling mechanism**. v1 moves traffic to a new instance (scale-up), so the jumps are large and slow. v2 adjusts capacity in most scaling events while keeping the writer or reader on the same host, and it does not disrupt database operations that are underway. This is the basis of "fine-grained adjustment." v2 is closer to "a regular Aurora instance with usage-based billing."

The choice by usage scenario is as follows.

- Traffic is constant 24 hours a day → regular Aurora instances (cut costs with Reserved)
- Traffic is periodic but predictable → Aurora + Auto Scaling for replicas
- Traffic is intermittent and unpredictable → Aurora Serverless v2
- Development/staging environments (unused at night) → Aurora Serverless v2 (auto-pause enabled)
- Mainly Data API calls → Aurora Serverless v2

## Aurora Global Database: The Secret to Sub-Second Cross-Region Replication

Aurora Global Database consists of **1 primary Region + up to 10 secondary Regions**. How it differs from an RDS Cross-Region Read Replica: ① dedicated replication infrastructure (storage-level replication); ② lag is typically < 1 second; ③ a secondary can have up to 16 of its own read replicas; ④ managed-failover RTO is on the order of minutes (switchover is typically under 30 seconds on supported versions).

```
[Primary Region: ap-northeast-2 Seoul]
  Aurora Writer + Replicas
       │
       │ (storage-level replication, < 1 second)
       │
       ├──→ [Secondary: us-east-1 N. Virginia]
       │      Read-only Aurora cluster
       │      Own read replicas 0-16
       │
       └──→ [Secondary: eu-west-1 Ireland]
              Read-only Aurora cluster
              Own read replicas 0-16
```

Aurora Global Database replication is **close to redo log shipping but is not the binlog**. The primary's storage nodes additionally send the redo log directly to the storage nodes in the secondary Region. This channel uses the AWS backbone network (average RTT of 100-200 ms on the same backbone), and compression and deduplication are applied, making it more efficient than the public internet. As a result, cross-Region lag is typically under 1 second. The answer to a "global distribution + sub-second lag + RDBMS" scenario is Aurora Global Database.

| Dimension | RDS Cross-Region Read Replica | Aurora Global Database |
|------|--------------------------------|------------------------|
| Replication method | Asynchronous binlog | Redo log shipping (dedicated infrastructure) |
| Typical lag | Several seconds to tens of seconds | < 1 second |
| Failover | Manual promote | Managed failover (on the order of minutes) |
| Number of secondary Regions | Many possible (each a separate replica) | Up to 10 (managed clusters) |
| Secondary read replicas | N/A (it is itself a replica) | Up to 16 per Region |
| RPO | Tens of seconds to minutes | < 1 second |

> ⚠️ **Pitfall**: The secondary of an Aurora Global Database is **read-only**. Attempting a plain write gives a read-only error. Also, "managed failover" must be triggered explicitly and is not automatic: when the primary Region is completely down, the operator executes the promote. If you need automatic failover, build the automation yourself with Route 53 health checks + Lambda, or use RDS Proxy. An answer choice saying "Aurora Global Database fails over automatically" is a trap.

## Aurora Backtrack vs PITR: In-Place Time Travel

Aurora MySQL has a feature RDS lacks: **Backtrack**. It rewinds data to a past point **without creating a new instance**, up to 72 hours back. PITR creates a new instance, but Backtrack rewinds the same instance in time.

| Item | Backtrack | PITR |
|------|-----------|------|
| Creates a new instance | ❌ (in-place) | ✅ |
| Speed | Seconds to minutes | Minutes to hours (depends on DB size) |
| Support | Aurora MySQL only | RDS + Aurora |
| Maximum period | 72 hours | 35 days |
| Cost | Backtrack window billed separately | Within the free range of automated backups |
| Scenario | Instant rollback of "I just ran DROP TABLE" | Restore data from an incident yesterday |

As a hypothetical case, a developer at a game company ran `DELETE FROM users` with no WHERE clause on a production Aurora MySQL (confusing it with the dev DB). Backtrack was enabled, so a single "rewind to 5 minutes ago" in the console recovered it in about 3 minutes. With PITR, a complicated procedure would have been needed: ① create a new instance (30 minutes), ② export/import the data (hours), ③ switch the application endpoint. For "fast mistake recovery in Aurora," Backtrack is the answer.

## Aurora Database Cloning: Instant Clones Built with COW

Aurora can **clone a cluster in a few seconds**. The clone shares the same storage and works by **copy-on-write**: only when data is modified in the clone is that page copied anew. The result: ① a clone can be created instantly; ② initial cost = 0; ③ you pay extra storage only for the amount modified.

```
[Primary Aurora] ────┬──── [Clone A] (development environment)
                     │
                     ├──── [Clone B] (test environment)
                     │
                     └──── [Clone C] (analytics workload)

At first, all share the same storage pages
When a modification occurs, only that page is copied for the clone (COW)
```

There is a pattern of making a clone of the production DB and testing with production-grade data. A regular mysqldump/export takes hours at TB scale, but an Aurora clone is created almost instantly. You can also use it in a CI/CD pipeline workflow that creates a clone for every build, tests against it, and deletes it afterward.

## RDS vs Aurora Decision Table

| Scenario keywords | Recommendation |
|----------------|------|
| Standard MySQL/PostgreSQL/MariaDB/Oracle/SQL Server | RDS |
| 5x performance / 15 replicas / auto-scaling storage | Aurora |
| Global distribution + sub-second lag | Aurora Global Database |
| Intermittent traffic + automatic scaling | Aurora Serverless v2 |
| In-place rollback within 72 hours | Aurora MySQL Backtrack |
| Oracle/SQL Server BYOL | RDS (not supported by Aurora) |
| Lowest-cost simple DB | RDS (~20% cheaper than Aurora) |

## Summary

Aurora's differentiation derives from one sentence: **"the storage layer was redesigned."**

- The 6-copy quorum guarantees availability.
- Shared storage makes replicas millisecond-level.
- Redo log shipping makes cross-Region replication sub-second.
- Copy-on-write makes clones instant.

The exam asks about these causal relationships in scenario form. You need to judge "which Aurora feature is the answer for which requirement."

RDS is the first-generation managed DB that "moved an existing DBMS to the cloud," and Aurora is the second generation that "redesigned the DBMS to be cloud-native." DynamoDB is yet another answer that "discarded the relational model itself." If you understand that there are three different answers to the same problem (data durability, scalability, availability), you can solve the exam scenarios.

In the next post, we tie together this whole week (RDS + ElastiCache + Aurora) in a scenario-centered way and wrap up the Week 7 comprehensive assessment.

---

## 📝 Practice Questions

**Question 1.** Which is correct about Aurora's storage configuration?

A) 1 copy in a single AZ
B) 6 copies in a single AZ
C) 6 copies across 3 AZs, write quorum 4/6
D) 3 copies across 2 AZs, write quorum 2/3

**Answer: C**

Explanation: Aurora uses distributed storage with 3 AZs × 2 copies = 6 copies, with write quorum V_w=4 and read quorum V_r=3. It satisfies V_w + V_r > N(6), guaranteeing strong consistency. Writes remain possible even with the loss of 1 AZ (the remaining 4 copies satisfy the quorum), and reads remain possible even with the loss of 1 AZ + 1 node. These numbers are the minimal solution satisfying fault tolerance in distributed systems.

---

**Question 2.** What is the biggest difference between an Aurora Replica and an RDS Read Replica?

A) An Aurora Replica uses asynchronous binlog replication
B) An Aurora Replica has no storage of its own and shares it with the primary, so lag is very short (usually much less than 100 ms)
C) An RDS Read Replica can go up to 30
D) They are identical

**Answer: B**

Explanation: The key differentiator of an Aurora Replica is shared storage: the replica has no disk of its own and references the same distributed storage as the primary. The replication mechanism sends only a "redo log notification" and reads actual pages directly from storage, so lag is usually much less than 100 ms (an RDS Read Replica is several seconds to tens of seconds). A) Aurora does not depend on the binlog. C) An RDS Read Replica goes up to 15 per source (MySQL/PG/MariaDB). D) There is a big difference.

---

**Question 3.** A SaaS company uses Aurora MySQL for global users. Read latency must be 100 ms or less in Tokyo and London as well, and if the Seoul Region goes down it must fail over to another Region within 1 minute. What is the most suitable configuration?

A) Use only Seoul Aurora Multi-AZ
B) Seoul Aurora + Aurora Cross-Region Read Replicas in Tokyo and London (one each)
C) Aurora Global Database (Primary: Seoul, Secondary: Tokyo and London)
D) DynamoDB Global Tables

**Answer: C**

Explanation: Aurora Global Database offers ① cross-Region lag typically < 1 second on dedicated infrastructure; ② managed failover RTO on the order of minutes; ③ the ability to promote a secondary to primary if the primary Region goes completely down; ④ each secondary Region can have its own read replicas, minimizing in-Region latency. B is possible with Aurora Cross-Region Read Replicas, but lag and failover automation are weaker. A has no cross-Region distribution. D loses RDBMS compatibility (unsuitable because the requirement is Aurora MySQL).

---

**Question 4.** Which of the following is NOT a characteristic of Aurora Serverless v2?

A) Scales automatically in ACU units (fine-grained 0.5 ACU steps)
B) Scaling does not disrupt database operations that are underway
C) Can scale up to 256 ACU (up to 384 ACU for Aurora PostgreSQL), depending on version
D) Min Capacity must always be 1 ACU or more

**Answer: D**

Explanation: D is wrong. The Min Capacity of Aurora Serverless v2 is 0.5 ACU (on newer engine versions, 0 ACU is also possible through auto-pause). It can start at a smaller granularity than v1. A) Scales gradually in 0.5 ACU steps. B) Scaling does not disrupt database operations that are underway (resuming from auto-pause takes about 15 seconds). C) Up to 256 ACU, depending on engine and platform version (up to 384 ACU for Aurora PostgreSQL). On the exam, the key to the v1 vs v2 comparison is "v2 is fine-grained + fast + non-disruptive scaling."

---

**Question 5.** Which is correct about Aurora Backtrack?

A) It can be used on both RDS and Aurora
B) It can rewind up to 35 days
C) It is available only on Aurora MySQL and rewinds time in place (no new instance created)
D) It is the same mechanism as PITR

**Answer: C**

Explanation: Backtrack is a feature unique to Aurora MySQL that rewinds the same cluster to a past point (up to 72 hours back) without creating a new instance. It is very fast (seconds to minutes). A) RDS does not support it. B) The maximum is 72 hours, not 35 days. D) PITR creates a new instance and restores by backup + log replay, a different mechanism from Backtrack. On the exam, the "fast mistake recovery in Aurora" scenario is Backtrack.

---

**Question 6.** What is the load balancing mechanism of the Aurora Reader Endpoint?

A) Round-robin at the application layer
B) At the DNS level, returning a different replica IP on each resolve
C) Uses a Network Load Balancer
D) Uses an Application Load Balancer

**Answer: B**

Explanation: The Aurora Reader Endpoint works by DNS round-robin: each time you resolve the same endpoint, a different replica IP is returned (TTL 5 seconds). As a result, **if you hold a connection for a long time, it is pinned to one replica**, and if the connection pool is small the load is uneven. Fixes: short connection lifetimes, Aurora cluster-aware clients (such as MariaDB Connector/J), or RDS Proxy. C) and D) ALB/NLB have nothing to do with Aurora's own endpoints.

---

**Question 7.** A fintech company wants to build an analytics environment every night from the data in its Aurora MySQL production DB. It used to take 6 hours with mysqldump + import, and they want it done within 5 minutes. What is the most suitable approach?

A) Create an Aurora Cross-Region Read Replica
B) Aurora Database Cloning (instant COW-based clone)
C) Copy an RDS Snapshot every day
D) Migrate every day with DMS

**Answer: B**

Explanation: Aurora Database Cloning shares the same storage with copy-on-write and creates a clone instantly: even TB-scale data is cloned in a few seconds. Only the pages modified in the clone incur extra storage cost. It is a standard pattern for CI/CD and daily ETL workloads. A) Cross-Region is for replication between Regions, not instant cloning. C) Snapshots take time to create/restore. D) DMS is a cross-engine migration tool and is excessive for same-engine replication.
