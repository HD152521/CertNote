# Day 5 - Week 5 Review: The Art of Choosing a Database

The database services covered in Week 5 were each built to solve a different problem. RDS runs traditional relational DBs without the management burden; Aurora overcomes the limits of relational DBs through storage redesign; DynamoDB serves hundreds of millions of items in milliseconds without a schema; ElastiCache delivers repeated reads at memory speed. Today is the day to firmly organize how these services are tested on the exam.

Most exam questions come in the form "which would you choose in this scenario?" The key is finding the reason one option — while several may look technically possible — is better than the rest. To find that "better reason," you must understand each service's design purpose and constraints from the inside. This is exactly why you need to understand why things were designed the way they were, not just memorize the technology.

## Core Summary of the Week

### RDS — The Two Axes of the Managed Relational DB

RDS's exam core is the difference between Multi-AZ and Read Replicas. These two features were built for completely different purposes, yet they're often confused. Multi-AZ is an **HA (high availability)** tool that maintains a Standby via **synchronous replication** and automatically promotes the Standby to Primary on failure. A Read Replica is a tool that creates read-only copies via **asynchronous replication** to **distribute read traffic**.

Evidence that the two features serve different purposes: the Standby handles no traffic in normal times. It exists solely for automatic failover (60-120s) on a Primary failure. A Read Replica receives read traffic through a separate endpoint. Its failover requires a manual promote and takes minutes to tens of minutes.

RDS Proxy solves two problems, each in a different way. It provides connection pooling for clients like Lambda that create bursty, high-volume connections, and it shortens the client's connection-switching time during a Multi-AZ failover.

| Feature | Purpose | Replication Method | Failover | Reads | Cost |
|---------|---------|--------------------|----------|-------|------|
| Multi-AZ | HA (high availability) | Synchronous | Automatic (60-120s) | Standby can't serve reads | 2× |
| Read Replica | Read scaling | Asynchronous | Manual promote | Possible (separate endpoint) | Additional per Replica |
| RDS Proxy | Connection pooling | N/A | Failover acceleration | N/A | A fraction of instance cost |

> 💡 **Why RDS Multi-AZ synchronous replication works even with 1-2ms lag** — The reason RDS Multi-AZ synchronous replication works well despite 1-2ms inter-AZ latency lies in the commit pattern of database transactions. In OLTP systems, most transactions complete in milliseconds. Even adding a 1-2ms inter-AZ RTT, the total transaction completion time stays at the millisecond level, so users don't feel much delay. In contrast, an inter-region RTT (e.g., Seoul-Tokyo about 35ms) seriously affects OLTP transactions. This is the basis for the design decision that "inter-region synchronous replication is impossible," and the reason Aurora Global Database chose asynchronous replication at the storage layer.

### Aurora — The Difference Shared Storage Makes

Aurora's differentiator is shared distributed storage. 6 copies, 3 AZs, 4/6 Quorum writes. The practical differences this structure creates:

- **Failover within 30 seconds**: The storage stays alive, so you only need to connect a new Writer instance to the storage. There's no need for time to let the Standby apply the Redo Log, as with RDS.
- **Up to 15 Read Replicas**: All Readers read from the shared storage, so there's no separate EBS per Replica. You can add Readers with no additional storage cost.
- **Replication Lag of tens of ms**: Because it's shared storage, there's no "replication" itself. The Readers read from the shared storage, so they see the same data almost simultaneously with the Writer.

Aurora Global Database replicates across regions at the storage layer to achieve < 1 second lag. RDS Cross-Region Read Replica replicates at the DB engine layer (binlog/WAL), so its lag is longer.

```
[Aurora shared storage structure]
Writer EC2 (AZ-a)    Reader EC2 (AZ-b)    Reader EC2 (AZ-c)
     │                     │                     │
     └─────────────────────┴─────────────────────┘
                           │
                    Shared distributed storage
               (6 copies / 3 AZs / automatic recovery)
                AZ-a: Copy 1, Copy 2
                AZ-b: Copy 3, Copy 4
                AZ-c: Copy 5, Copy 6
              4/6 Quorum write / 3/6 Quorum read
```

### DynamoDB — Partition Design Is All of Performance

The single most important concept in DynamoDB is partition key design. If a Hot Partition occurs, you can mitigate it with Adaptive Capacity, but fundamentally you must redesign the partition key.

| Concept | Key Fact |
|---------|----------|
| Partition key | Even distribution + High Cardinality required |
| WCU | One 1KB write = 1 WCU (transactions are ×2) |
| RCU | One 4KB strongly consistent read = 1 RCU, eventual consistency is ×0.5 |
| LSI | Same PK, different SK. Added only at creation. Strong consistency possible |
| GSI | Different PK. Added any time. Eventual consistency only |
| DAX | DynamoDB-only cache. Applied with just an SDK change. Microseconds |
| Global Tables | Multi-region active-active. LWW conflict resolution. ~1s replication |
| Streams | 24-hour change log. Follow-up processing via Lambda event source mapping |
| On-Demand | When traffic is unpredictable. Per-request billing |
| Provisioned+AS | When traffic is stable. Cost optimization |
| PITR | Second-level recovery within 35 days. Restores only to a new table |

> 💡 **Choosing Week 5 services through the CAP theorem** — Database selection is a practical application of the CAP theorem (Brewer, 2000). RDS Multi-AZ chooses CP (Consistency + Partition Tolerance) within the same region. DynamoDB eventual consistency chooses AP (Availability + Partition Tolerance). Aurora Global Database's Primary region is CP, while its Secondary regions are closer to AP with eventual consistency. MemoryDB for Redis strongly guarantees C with its durability guarantee (Multi-AZ WAL). Which trade-off you choose based on business requirements is the core of the architecture decision. A distributed system that always satisfies "CA" is impossible by the CAP theorem.

### Choosing a Cache — Positioning the 4 Tools

ElastiCache Redis, Memcached, DAX, and MemoryDB each solve a different problem.

| Tool | Suitable Scenario | Key Distinguishing Keywords |
|------|-------------------|-----------------------------|
| ElastiCache Redis | Sessions, leaderboards, Pub/Sub, general cache | Rich data structures, Multi-AZ HA |
| ElastiCache Memcached | Simple String cache, multi-threaded CPU efficiency | Simple, no HA needed |
| DAX | Microsecond acceleration of DynamoDB reads | DynamoDB-only, SDK change only |
| MemoryDB for Redis | Lossless durability + Redis API | Durability, Redis as the main DB |

## Easily Confused Comparisons — Fully Sorted Out

Here we sort out, all at once, the pairs most frequently confused on the exam.

**Multi-AZ vs Read Replica**:
- If HA is the goal, Multi-AZ. Automatic failover, synchronous replication, Standby doesn't take reads.
- If read scaling is the goal, Read Replica. Asynchronous replication, separate endpoint, manual promote.
- If the scenario shows "availability," "automatic failure recovery," "minimize downtime," it's Multi-AZ. If it shows "read load," "performance improvement," "regional reads," it's Read Replica.

**Aurora vs RDS**:
- "15 Replicas," "30-second failover," "< 1s cross-region replication," "auto-scaling for fluctuating traffic" → Aurora
- "Oracle/SQL Server/MariaDB engine required," "cost savings top priority," "stable workload" → plain RDS

**GSI vs LSI**:
- Can be added after table creation and a completely different PK → GSI (eventual consistency only)
- Keeps the same PK, needs strong consistency, and added at table creation → LSI

**DAX vs ElastiCache**:
- DynamoDB-only and needs only an SDK change → DAX
- Caching various sources (RDS, Aurora, API results) or sessions/Pub/Sub → ElastiCache Redis

**MemoryDB vs ElastiCache Redis**:
- Data loss on failure is absolutely unacceptable → MemoryDB
- Loss is acceptable and used as a cache → ElastiCache Redis

**Aurora Global Database vs RDS Cross-Region Read Replica**:
- < 1s replication lag, storage-layer replication, failover within 1 minute → Aurora Global DB
- General-purpose engines (MySQL, PG, Oracle, etc.), seconds of lag acceptable → RDS Cross-Region RR

**DynamoDB Global Tables vs Aurora Global DB**:
- Writes needed in all regions (active-active), NoSQL → DynamoDB Global Tables
- Relational + writes only in the Primary region, read distribution → Aurora Global DB

> 📚 **The Capital One security incident and DB architecture lessons** — The 2019 Capital One data breach (exposure of 106 million people's personal information) was an IAM and EC2 metadata-service security problem rather than a database design one. Yet the incident reminded us how important RDS encryption, KMS key management, placement in private subnets within a VPC, and least-privilege principles are. Placing RDS in a public subnet, granting excessive IAM permissions, or disabling encryption became the causes of real incidents. On the SAA-C03 exam too, "put the DB in a private subnet, enable encryption, least-privilege IAM" is always the correct security answer.

## Integrated Architecture — This Is How It's Actually Used

In reality, these services aren't used in isolation; they form layers and work together.

```
[ Multi-layered data architecture of an e-commerce platform ]

Mobile/Web
     │
     ▼
CloudFront (edge cache — static content, some API responses)
     │
     ▼
API Gateway (HTTP API) → Lambda
                              │
     ┌────────────────────────┤
     │                        │
     ▼                        ▼
DAX → DynamoDB          ElastiCache Redis
(order/inventory events) (session/real-time inventory)
     │                        │
     │ Streams                │ Cache-Aside
     ▼                        │
Lambda → OpenSearch      RDS Proxy
(search indexing)             │
                             ▼
                      Aurora Multi-AZ
                      (user/product relational data)
                             │ Global DB (<1s replication)
                             ▼
                      Aurora Secondary (us-east-1)
                      (read distribution for overseas users)

[ Analytics pipeline ]
Aurora → DMS → Redshift (nightly OLAP analytics)
DDB → S3 Export → Athena (serverless queries)
CloudWatch Logs → Firehose → OpenSearch (real-time log analytics)
```

The role of each service in this architecture:
- **CloudFront**: Static content, caching some API responses
- **ElastiCache Redis**: Login sessions, real-time inventory-count cache (read often, changed occasionally)
- **DynamoDB + DAX**: Order history, click events (write-heavy, flexible schema, microsecond reads)
- **DynamoDB Streams → Lambda → OpenSearch**: Automatically update the search index on order insertion
- **Aurora**: User accounts, product catalog, relational data
- **OpenSearch**: Product search, log analytics, Dashboards visualization
- **Redshift**: Nightly batch OLAP analytics, BI dashboards

> 🔍 **Data access pattern analysis comes first** — Questions you must answer before designing an architecture: (1) What's the read-to-write ratio? (2) Is the traffic pattern predictable? (3) What are the response-latency requirements? (4) Is the data model relational or Key-Value? (5) Are there global users? (6) What's the tolerable data-loss level (RPO)? (7) What's the tolerable downtime level (RTO)? Answer these 7 questions and the service choice is almost automatically determined. SAA-C03 exam questions also emphasize one or more of these 7 dimensions to guide you to the answer.

## Choices From a Cost-Optimization Perspective

SAA-C03 also covers the Cost Optimization Pillar (20%). Cost perspectives in database selection:

**RDS vs Aurora**: Aurora costs about 20% more. "Scenarios where Aurora is justified for the same MySQL/PostgreSQL workload" are when the failover requirement is within 30 seconds, 15+ Readers are needed, global replication is needed, or traffic fluctuates.

**On-Demand vs Provisioned**: DynamoDB On-Demand is up to 4× more expensive than Provisioned for stable traffic. Workloads with predictable traffic are cost-efficient with Provisioned + Auto Scaling.

**ElastiCache cache**: If the cache hit rate is 90%+, the cache lets you shrink the DB instance size, so overall cost drops. Setting the TTL too short lowers the hit rate.

**Aurora I/O-Optimized**: If I/O cost is 25%+ of the total, the I/O-Optimized pricing plan is favorable. It converts to a flat I/O cost.

**ElastiCache Reserved Nodes**: A 1-year or 3-year reservation saves up to 55% versus on-demand. For a stable cache workload, Reserved is favorable.

> ⚠️ **Why instance upsizing is the last resort** — "Upgrade to a bigger instance" isn't always right. Read load is solved more cost-efficiently by a Read Replica, connection-count problems by RDS Proxy, repeated reads by ElastiCache, and DynamoDB reads by DAX. Instance upsizing is the last resort. On the exam, when an "increase the instance size" option appears, first check whether there's a more precise solution (Proxy, Read Replica, Cache).

## Service Comparison From a DR Perspective

Here we organize how the Week 5 services play their roles in disaster recovery (DR).

| Service | RPO | RTO | Mechanism |
|---------|-----|-----|-----------|
| RDS Multi-AZ | ~0 (synchronous) | 60-120s | Automatic DNS Failover |
| Aurora Multi-AZ | ~0 (shared storage) | Within 30s | Reader → Writer promotion |
| Aurora Global DB | < 1s | < 1 min | Manual/automatic Promote |
| DynamoDB (single region) | ~0 (PITR) | ~minutes | New-table recovery |
| DynamoDB Global Tables | ~1s | ~0 (other region already serving) | Endpoint switch |
| ElastiCache Redis Multi-AZ | Seconds (async) | Seconds (automatic Failover) | Read Replica promotion |
| MemoryDB for Redis | ~0 (WAL synchronous) | Seconds | Automatic recovery |

---

## 📝 시나리오 연습 문제

**문제 1.** A startup launches a new social media app. Traffic was 100 RPS a day, then suddenly surged to 50,000 RPS after going viral. The DB is PostgreSQL. To handle this traffic without service interruption:

A) Switch to RDS PostgreSQL Multi-AZ (secure high availability)
B) Aurora PostgreSQL Serverless v2 (auto-scaling)
C) Add 5 RDS PostgreSQL Read Replicas (distribute reads)
D) Migrate to DynamoDB On-Demand (automatic capacity)

**정답: B**

해설: To respond automatically to a traffic surge, compute capacity must auto-scale. Aurora Serverless v2 auto-scales in seconds from 0.5 to 256 ACU and is PostgreSQL-compatible, so migration is easy. A solves HA but not the capacity-shortage problem. C distributes reads but doesn't increase write capacity, and you'd have to create 5 Replicas in advance, so it responds slowly to a sudden surge. D requires a migration period and can't be applied instantly.

---

**문제 2.** An online banking system stores account transaction records. Every transaction must be recorded immutably for audit purposes, and queries computing the balance at an arbitrary point in the past are needed. What is the most suitable service?

A) DynamoDB (restore past state with PITR)
B) RDS Aurora (transaction guarantees)
C) Amazon QLDB (Ledger DB, immutable transaction ledger)
D) S3 + Glacier (cheap long-term retention)

**정답: C**

해설: QLDB is an immutable ledger DB where every data change is recorded in a cryptographically verifiable hash chain. "Immutable for audit purposes" + "computing past balances (arbitrary point-in-time lookups)" are QLDB's core functions. A — DynamoDB PITR can view past state but doesn't guarantee immutability. B supports relational transactions but has no immutable-ledger function. D is object storage with no DB functionality.

---

**문제 3.** You're building a game leaderboard system. You must store millions of scores in real time and handle "look up the top 100" and "look up a specific user's rank" within tens of ms. What is the most suitable service?

A) DynamoDB + GSI (sorted by score)
B) RDS MySQL (ORDER BY score query)
C) ElastiCache Redis Sorted Set (ZSet)
D) OpenSearch (aggregation query)

**정답: C**

해설: The Redis Sorted Set (ZSet) is a data structure born for leaderboards. You add members with scores via ZADD, get the top N with ZREVRANGE, and look up a specific member's rank with ZRANK in O(log N). When scores change, the sort order updates automatically. Even millions of records are handled in tens of μs in memory. A — a GSI can query by score but is millisecond-level, and there's GSI async-replication lag on real-time rank updates. B — large-scale sort queries put heavy load on the DB. D can aggregate but isn't natural for real-time rank updates.

---

**문제 4.** On an Aurora MySQL cluster, an analytics team frequently runs OLAP queries that affect the OLTP workload. To solve this with minimal additional cost:

A) Create a separate Aurora cluster for analytics (2× cost)
B) Create a Custom Endpoint, designate analytics Reader instances, and have the analytics team use the Custom Endpoint
C) Run analytics queries in an Aurora Global Database Secondary region
D) Route analytics and OLTP queries through RDS Proxy

**정답: B**

해설: A Custom Endpoint is a feature that groups specific Reader instances into a separate endpoint. If the analytics team uses the Custom Endpoint, it's separated from the OLTP Readers so they don't affect each other. Since it reuses existing Reader instances, additional cost is lowest. If the analytics load is very large, you can make the analytics Reader instances bigger (r5.8xlarge, etc.). A doubles the cost. C — a Secondary region isn't completely independent and has replication lag. D — RDS Proxy doesn't support this kind of query routing.

---

**문제 5.** A company consumes a very large amount of RCU on a DynamoDB table. Analyzing the access pattern reveals that 80% of all reads are concentrated on the same 100 items. What is the most cost-efficient solution?

A) Switch to DynamoDB On-Demand mode
B) Double the DynamoDB Provisioned RCU
C) Add a DAX cluster to cache the Hot Items
D) Add a GSI to distribute reads

**정답: C**

해설: 80% of reads concentrating on 100 items is a Hot Item pattern. DAX caches these 100 items in memory so that repeated reads are handled by DAX rather than DynamoDB. As a result, the RCU consumption reaching DynamoDB drops significantly. A — On-Demand bills per request, so it can actually be more expensive. B — raising RCU doesn't reduce the waste. D — a GSI is a tool for accessing by a different partition key, not a solution to the Hot Item problem.

---

**문제 6.** Regular maintenance (OS/engine patching) is scheduled on a Multi-AZ RDS MySQL. To minimize downtime while this work runs:

A) Set the maintenance window to the longest possible night hours
B) With Multi-AZ enabled, it patches the Standby first and then patches the old Primary after failover, minimizing downtime (usually within 60 seconds)
C) Create a Read Replica and move traffic to it during patching
D) Create a new instance from a snapshot and patch that

**정답: B**

해설: Multi-AZ RDS maintenance updates the Standby instance first, and when done, switches the Standby to the new Primary via failover. Then it updates the old Primary (now the Standby). The only actual service interruption in this process is the failover time (usually under 60 seconds). This is how Multi-AZ provides HA during operational maintenance. C — a Read Replica can't take write traffic, so it isn't a complete substitute. D requires additional cost and endpoint-switching work.

---

**문제 7.** In a message feed app, each user must be able to see the latest messages from the people who follow them. Messages are chronological, and you must quickly fetch "the 50 most recent messages in a specific user's feed." If using DynamoDB, what is the table design?

A) PK: messageId, no SK — simple message storage
B) PK: feedUserId, SK: timestamp — Composite Key with the feed user as partition and time as sort key
C) PK: senderId — partition per sender
D) PK: timestamp — all messages in chronological order

**정답: B**

해설: Using DynamoDB's composite primary key (PK + SK), you can efficiently fetch "a specific feed user's latest messages" in a single query. Since feedUserId is the partition key, that user's entire feed is in the same partition, and since timestamp is the sort key, you can immediately fetch the "latest 50" in DESC order. A requires a Scan for per-feed lookups. C — with a partition per sender, you'd have to combine multiple partitions to build a follower feed. D — using timestamp as the PK piles all simultaneously-occurring messages into the same partition (Hot Partition).

---

**문제 8.** An application currently using RDS PostgreSQL has no DBA and wants to automate OS patching, DB patching, backups, and Multi-AZ setup going forward. Which option reduces the most operational burden while maintaining existing PostgreSQL compatibility?

A) Install PostgreSQL directly on EC2 and automate backups with cron
B) RDS PostgreSQL (enable Multi-AZ, configure automated backups)
C) Aurora PostgreSQL (shared storage, 15 Readers, 30-second failover, automated backups)
D) Run a PostgreSQL container on ECS Fargate

**정답: C**

해설: Aurora PostgreSQL has AWS take on more operational burden than RDS PostgreSQL. It adds storage management (auto-expansion, 6-copy management), faster failover (30s vs 60-120s), support for more Readers, and Fast Clone. RDS PostgreSQL (B) is managed too, but Aurora provides higher availability and scaling capability. A and D have the largest operational burden.

---

**문제 9.** In a delivery app, you must store each rider's current location and handle "look up available riders within a 5km radius" in real time. What is the most suitable service?

A) DynamoDB (store as geographic coordinate attributes)
B) RDS PostgreSQL + PostGIS extension (spatial queries)
C) ElastiCache Redis Geospatial Index
D) OpenSearch Geo Distance Query

**정답: C**

해설: ElastiCache Redis supports a Geospatial Index (GEOADD/GEORADIUS/GEOSEARCH commands). Add rider locations with GEOADD and look up riders within a radius in memory in microseconds with GEORADIUS. Rider location is volatile data updated every second, so speed matters more than persistence. B is possible but RDS struggles to handle real-time millions of location updates and lookups. D is also possible but isn't optimized for real-time in-memory processing the way ElastiCache Redis is.

---

**문제 10.** A Lambda-based microservice uses Aurora MySQL. At peak traffic, Lambda concurrency reaches 500 and Aurora starts emitting "max_connections" errors. What is the most suitable solution?

A) Upgrade the Aurora instance to a larger class (increase max_connections)
B) Limit Lambda's reserved concurrency to 100 (forcibly reduce connection count)
C) Add RDS Proxy between Aurora and Lambda (connection pooling)
D) Switch to Aurora Serverless v2 (auto-scaling)

**정답: C**

해설: RDS Proxy is the exact solution for this situation. Instead of 500 Lambdas each connecting directly to Aurora, they all connect to the Proxy, and the Proxy maintains a small number of connections to Aurora. Through connection reuse, it can handle 500 Lambda requests within Aurora's max_connections limit. A — even raising max_connections has limits, and a larger instance means significant cost increase. B artificially limits Lambda throughput and may fail to meet business needs. D — Serverless v2 scales compute capacity but doesn't solve the connection-count limit.

---

**문제 11.** A company collects temperature, pressure, and humidity data from 1 million IoT devices per second. Each device sends 1 record per second. To efficiently store this data and quickly look up "a specific device's temperature trend over the past 24 hours":

A) DynamoDB (PK: deviceId, SK: timestamp)
B) Amazon Timestream (time-series-specialized DB)
C) RDS PostgreSQL (timestamp column index)
D) S3 + Athena (store in Parquet format)

**정답: B**

해설: IoT time-series data is a core use case for Amazon Timestream. Timestream has storage and a query engine optimized for time-series data, so it processes time-range queries far faster than a general DB. It handles 1 million writes per second with auto-scaling, and old data automatically moves to a cheaper storage tier. A is possible too, but handling 1 million writes per second requires very high WCU, and it isn't optimized for time-series analytics queries. C is unsuitable for time-series processing at this scale. D has slow real-time lookups.

---

**문제 12.** A SaaS platform accessed by users in 150 countries worldwide stores user settings data. Writes and reads occur simultaneously in each region, and a "last write wins" policy is acceptable on settings conflict. What is the most suitable service?

A) Aurora PostgreSQL Global Database (writes only in the Primary)
B) RDS PostgreSQL Cross-Region Read Replica (reads in each region)
C) DynamoDB Global Tables (multi-region active-active, LWW)
D) ElastiCache Redis + Lambda (implement replication yourself)

**정답: C**

해설: "Writes and reads occur simultaneously in each region" requires multi-region active-active. DynamoDB Global Tables accepts writes in multiple regions simultaneously while replicating to the other regions within ~1 second. "Last write wins (LWW)" conflict resolution also exactly matches DynamoDB Global Tables' default policy. A can write only in the Primary, so it's unsuitable for geographically distributed writes. B is a read-only Replica, so writes are impossible in each region. D has the complexity and reliability problems of a self-built implementation.

---
