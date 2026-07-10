# Day 4 - ElastiCache and In-Memory Data Stores: The Physics of Speed

The difference between the time a database takes to read data from disk versus from memory ranges from thousands to tens of thousands of times. An NVMe SSD's sequential read latency is 50-100μs, while DRAM's access latency is 50-100ns. A 1000× difference. This physical gap is the reason caches exist. ElastiCache Redis, Memcached, DAX, MemoryDB — all of these services are built on top of this physical fact.

There are numbers that show in-memory data stores aren't merely a performance option. According to AWS, an architecture that leverages ElastiCache can reduce read latency by over 90% compared to an RDS-only setup and cut DB RCU cost by 60-80%. As a result, ElastiCache is the "performance improvement" answer that appears most frequently on the SAA-C03 exam.

## Caching Patterns — How to Fill and Empty the Cache

Before introducing a cache, you must decide which pattern to operate it with. Each pattern has different pros and cons, and the exam asks "which pattern fits which situation."

**Cache-Aside (Lazy Loading)**: The most widely used pattern. When a read request comes in, check the cache first; if it's not there (Cache Miss), read from the DB, store it in the cache, then return it. If it's in the cache (Cache Hit), return it directly without touching the DB.

```
App → check cache
     │
     ├─ Cache Hit → return from cache (fast, no DB access)
     │
     └─ Cache Miss → query DB → store result in cache + return
                                 (next identical request is a Cache Hit)
```

Pros: only actually-read data is in the cache. Even during a DB failure, data in the cache can be served. On a cache failure, fall back to the DB.
Cons: the first request is always a Cache Miss (cold-start latency). When DB data changes, the cache may serve stale data.

**Write-Through**: Updates the DB and the cache at the same time at write time. Cache data is always fresh, but write latency increases and even unread data fills the cache (cache pollution).

**Write-Behind (Write-Back)**: Writes only to the cache first, then asynchronously reflects it to the DB later. Write performance is high, but there's a data-loss risk on cache failure. Suitable for write-intensive workloads that need top performance.

**TTL (Time-To-Live)**: The expiration time of a cache item. Limits the Stale Data problem on a time basis. A short TTL means low cache efficiency; a long TTL means stale data lingers. Tuning is needed based on business requirements.

| Pattern | Read Optimization | Write Optimization | Stale Risk | Data-Loss Risk |
|---------|-------------------|--------------------|-----------|----------------|
| Cache-Aside | High | - | Yes (TTL-dependent) | None (DB is SoR) |
| Write-Through | High | Low | None | None |
| Write-Behind | High | High | None | Yes (on cache failure) |
| Read-Through | High | - | Yes | None |

> 💡 **Cache eviction algorithms and eviction policies** — The representative Cache Eviction algorithm is LRU (Least Recently Used). A concept originating in Jim Gray and Franco Putzolu's 1976 IBM research, it removes the item used least recently. Beyond the default LRU, Redis supports 8 policies, including LFU (Least Frequently Used — remove the least-used item), Random (remove at random), allkeys-lru (LRU including keys without a TTL), and volatile-lru (LRU only on keys with a TTL). Generally, LFU suits workloads with "evenly distributed popularity," and LRU suits workloads where "recently accessed items are likely to be accessed again" (time series, sessions). In ElastiCache Redis, you set this with the `maxmemory-policy` parameter.

> 🔍 **The Thundering Herd (Cache Stampede) problem** — A problem that frequently occurs in large-scale caches. The moment a popular cache item's TTL expires, dozens to hundreds of concurrent requests all get a Cache Miss and rush to the DB, overloading it. Countermeasures: (1) add random jitter to the TTL to spread out expiration times, (2) Mutex Lock — only the first request queries the DB while the rest wait, (3) Probabilistic Early Expiration — probabilistically refresh in advance just before TTL expiry. You can implement a Mutex Lock with Redis's atomic operation (`SET NX`).

## ElastiCache Redis — The Data Structure Server

Redis (Remote Dictionary Server) is an open-source in-memory data structure server developed by Salvatore Sanfilippo in Italy in 2009. We call it a "cache," but inside it has rich data structures: String, List, Set, Sorted Set (ZSet), Hash, Bitmap, HyperLogLog, Stream, and Geospatial Index. This variety makes Redis a session store, leaderboard, real-time counter, Pub/Sub broker, and job queue, beyond a simple cache.

ElastiCache Redis provides this Redis in managed form. The operator doesn't need to install the Redis binary, configure AOF/RDB, set up Cluster Mode, or configure replication directly — it's all controlled via the AWS console and CLI. ElastiCache Redis supports up to Redis 7.x, and supports both Redis Cluster mode and Redis Sentinel mode.

**Redis data structures and use cases:**

| Data Structure | Command Examples | Real Use Cases |
|----------------|------------------|----------------|
| String | GET/SET/INCR | Session ID, counters, distributed lock |
| List | LPUSH/RPOP | Job queue, recent activity feed |
| Hash | HSET/HGET | Storing object attributes (user profile) |
| Set | SADD/SISMEMBER | Tags, permissions, unique visitors |
| Sorted Set | ZADD/ZRANGE | Leaderboards, priority queue |
| HyperLogLog | PFADD/PFCOUNT | Approximate count of unique users |
| Stream | XADD/XREAD | Message broker, event log |
| Geospatial | GEOADD/GEODIST | Location-based services |

### Persistence — AOF and RDB

Although Redis is in-memory, it provides two ways to persist data to disk.

**RDB (Redis Database Snapshot)**: Writes a snapshot of the entire dataset to disk at a designated interval (e.g., when 10,000+ changes occur every 5 minutes). Because a child process does the write via the fork() system call, the main process can keep serving. The file size is small and recovery is fast. Downside: data between snapshots can be lost (RPO = snapshot interval, up to several minutes).

**AOF (Append-Only File)**: Records all write commands to a file in order. On server restart, it replays the AOF to recover the data. fsync options:
- `fsync=always`: sync on every command (RPO ≈ 0, performance degradation)
- `fsync=everysec`: sync once per second (RPO ≈ 1 second, recommended)
- `fsync=no`: leave it to the OS (uncertain RPO, top performance)

In ElastiCache Redis, you can use both together for persistence (periodic snapshots via RDB + command logging via AOF). However, because ElastiCache has Multi-AZ replication, you choose the configuration from a "backup/recovery" and "HA" perspective rather than persistence itself.

> 🔍 **Redis's single-threaded model and atomicity** — From Redis 6.0 (2020), Redis introduced Multi-threaded I/O. Until then, Redis processed commands single-threaded and could use only one CPU core. In Redis 6.0, network I/O is handled multi-threaded, while command execution remains single-threaded to guarantee Atomicity. Thanks to the atomicity created by Redis's single-threaded command processing, the `INCR` command guarantees counter increment without a Race Condition. ElastiCache Redis supports this version. If the performance bottleneck is CPU alone, sharding through Cluster Mode is more effective.

### Redis Cluster Mode — Horizontal Scaling Through Sharding

Redis Cluster Mode ("Cluster Mode Enabled" in ElastiCache) divides data into multiple shards distributed across multiple nodes. It divides 16,384 slots by the number of shards and assigns them to each shard. The remainder of the key's CRC16 hash value divided by 16,384 becomes the slot number.

Cluster Mode Disabled (default): One shard. The entire data lives on the Primary node, and Read Replicas hold copies. Up to a 250GB data limit (node-size limit). No restrictions on Multi-Key operations.

Cluster Mode Enabled: Multiple shards. Each shard has a Primary + Replica. Scales to multiple TB. Restrictions on Multi-key operations (only keys in the same slot can be processed in a transaction).

```
[Cluster Mode Enabled - 3 shards]

Shard 1 (slots 0-5460)      Shard 2 (slots 5461-10922)  Shard 3 (slots 10923-16383)
Primary (AZ-a)              Primary (AZ-b)              Primary (AZ-c)
Replica (AZ-b)              Replica (AZ-c)              Replica (AZ-a)

Key "user:1" → CRC16 → slot 2345 → Shard 1
Key "product:A" → CRC16 → slot 7890 → Shard 2
```

Hash Tags (`{user}:sessions`, `{user}:profile`): use only the string inside the curly braces `{}` for hashing to force multiple keys into the same slot. This makes MGET/MSET and transactions usable on those keys.

> 💡 **Why Redis Cluster isn't Consistent Hashing** — Redis Cluster uses a Hash Slot approach instead of Consistent Hashing. The reason is the simplicity of slot redistribution (Resharding). When adding a node, you just move slots, so you can clearly track which key goes to which node. Consistent Hashing is theoretically elegant, but for cases like real Redis that need hot-slot redistribution or manual slot assignment, it's hard to debug. The 16,384 slots are designed as a number fine-grained enough to distribute even across 1,000 nodes.

> 📚 **The Twitter Redis case** — In 2018, Twitter revealed how it uses Redis at scale. It uses Redis Cluster for Timelines (timeline caching), Trends (real-time trend counters), Rate Limiting (API rate limiting), and more, handling millions of Redis operations per second. In particular, for timeline lookups, it uses Redis Sorted Sets to keep each user's recent tweet list in memory and serves timelines without a DB query. It adds to a timeline with `ZADD timeline:{userId} {timestamp} {tweetId}` and returns the latest 50 tweets in O(log N + K) time with `ZREVRANGE timeline:{userId} 0 49`. This is a textbook use case of the Redis ZSet (Sorted Set).

## Memcached — The Aesthetics of Simplicity

Memcached was developed by Brad Fitzpatrick in 2003 to reduce LiveJournal's DB load. It's far simpler than Redis. It supports only the String type, has no persistence, no replication, and no Pub/Sub. In exchange, it's truly multi-threaded and can fully utilize multiple CPU cores, with good memory efficiency.

Cases where ElastiCache Memcached is suitable:
- When you only need simple object caching and don't need complex data structures
- When you must maximize the use of multiple cores with multi-threading (large-scale simple cache)
- A pure cache layer that needs no persistence, HA, or replication
- When you need to scale the cache linearly by adding nodes horizontally (each node independent)

In practice, on the SAA-C03 exam, questions choosing between Redis and Memcached almost always have Redis as the answer. Memcached is the answer only when the keywords explicitly state "no need for persistence/replication/varied data structures" + "multi-threaded CPU efficiency matters."

| Aspect | ElastiCache Redis | ElastiCache Memcached |
|--------|-------------------|-----------------------|
| Data structures | String/List/Set/ZSet/Hash/Stream/Geo, etc. | String only |
| Persistence | RDB/AOF options | None |
| Replication / HA | Multi-AZ + automatic failover | None |
| Cluster | Cluster Mode (sharding, 16384 slots) | Simple hash distribution (client-side) |
| Pub/Sub | Supported | Not supported |
| Transactions | MULTI/EXEC (atomic) | Not supported |
| Lua scripting | Supported (server-side atomic execution) | Not supported |
| Thread model | Single-threaded processing (I/O is multi-threaded) | Fully multi-threaded |
| TLS/Auth | AUTH, ACL, TLS, RBAC | SASL (limited) |
| Geospatial | Supported | Not supported |
| TTL | Settable per item | Settable per item |

## MemoryDB for Redis — Breaking Down the Boundary Between Cache and DB

If ElastiCache Redis is "a cache in front of the DB," MemoryDB for Redis is a service where "Redis is the main DB." This difference comes from the durability guarantee.

ElastiCache Redis's persistence is best-effort. It has Multi-AZ replication, but the replication between Primary and Replica is asynchronous, so some recent writes may be lost on a Primary failure. When there's a premise that "if cache data is lost, you can just re-read it from the DB," this is sufficient.

MemoryDB for Redis persists all writes to a Multi-AZ transaction log (WAL-based). The transaction log is synchronously distributed across multiple AZs. Thanks to this, MemoryDB guarantees durability with no data loss while using the Redis API as-is.

```
[ElastiCache Redis]                [MemoryDB for Redis]
Primary ─async─► Replica           Writer ─sync─► Multi-AZ transaction log
                                              └── Reader (Redis API)
Cache: recover from DB on failure  Main DB: this itself is the reliable source (SoR)
```

Suitable use cases:
- A main DB that needs microsecond reads + single-digit ms writes
- When you want to run a Redis-compatible application without a separate cache layer
- Cases like session data where fast access matters but loss is unacceptable
- When you need both high write throughput and durability, like leaderboards and real-time counters

> 🔍 **The MemoryDB WAL mechanism** — MemoryDB's durability-guarantee mechanism resembles the WAL (Write-Ahead Logging) of traditional RDBMSs. When a write comes in, it first records it to the transaction log (synchronously to multiple AZs), then applies it to memory. On failure, it replays the transaction log to recover the memory state. The difference from Redis's existing AOF (fsync=always) is that MemoryDB's log is distributed across Multi-AZ, so data is preserved even if one AZ is completely lost. Even if you enable AOF in ElastiCache Redis, the AOF file itself exists only on disk within a single AZ, so recovery is impossible on an AZ failure.

> ⚠️ **The criterion for choosing ElastiCache Redis vs MemoryDB** — Exam trap: avoid the oversimplification "if you use the Redis API and need high availability, choose MemoryDB." ElastiCache Redis Multi-AZ also provides high availability. The difference is the **level of durability guarantee**. If cache data loss is acceptable (you can refill it from the DB) → ElastiCache Redis. If data loss is absolutely unacceptable and Redis must be the source of truth → MemoryDB. Cost: MemoryDB is about 2-3× more expensive than ElastiCache Redis.

## DAX — The Specialness of a DynamoDB-Only Cache

DAX (DynamoDB Accelerator) is not a general-purpose cache. It's a specialized cache that works only in front of DynamoDB. With DAX, application code barely changes. Switch from the DynamoDB SDK to the DAX SDK and you don't have to implement cache hit/miss logic yourself.

Where DAX is better than ElastiCache:
- Fully compatible with the DynamoDB API → minimal code changes
- Automatic management of Item Cache and Query Cache
- Cooperates well with DynamoDB's Adaptive Capacity
- DynamoDB-specific optimizations (partition-key hash awareness)

Where DAX is worse than ElastiCache:
- Can only be used with DynamoDB (no general-purpose caching)
- Doesn't support strongly consistent reads (eventual consistency only)
- Can't cache results from other sources like RDS, Aurora, or external APIs
- Write caching is Write-Through only
- Accessible only within a VPC (requires Lambda + VPC configuration)

| Aspect | DAX | ElastiCache Redis |
|--------|-----|-------------------|
| Target | DynamoDB-only | General-purpose (DB, API, computed results) |
| Code changes | SDK change only | Implement cache logic yourself |
| Consistency | Eventual only | Eventual + strong (depends on source) |
| Response latency | Microseconds | Sub-milliseconds |
| Data structures | DynamoDB items | String/List/Hash/ZSet, etc. |
| Use cases | DDB read-heavy | Sessions, leaderboards, general cache |
| Cost | DDB cost-savings effect | Separate ElastiCache cost |

## OpenSearch — The Engine for Search and Log Analytics

Amazon OpenSearch Service provides the OpenSearch project — a fork of Elasticsearch — in managed form. In 2021, Amazon split OpenSearch off as open source based on Elasticsearch 7.10. Existing Elasticsearch-based OpenSearch Service domains can be upgraded to OpenSearch 2.x.

What sets OpenSearch apart from DynamoDB or RDS is inverted-index-based full-text search. For tasks like "finding documents containing a specific word," range queries, aggregation analytics, and geospatial search, it's vastly faster than an RDBMS.

Main use cases:
- **Log analytics**: CloudWatch Logs → Kinesis Data Firehose → OpenSearch → OpenSearch Dashboards (a Kibana replacement)
- **Full-text search**: product search, document search, code search
- **Security analytics**: SIEM (Security Information and Event Management)
- **Time-series analytics**: metrics, IoT events

OpenSearch Serverless: launched in 2023. Auto-scales based on actual indexing/search volume without managing server capacity. Suitable for intermittent or unpredictable workloads.

UltraWarm / Cold Storage: recent data on Hot (SSD), older data on UltraWarm (S3 + compression), very old data on Cold (S3). Retain logs long-term while progressively reducing cost.

```
Log data flow:
EC2/ECS → CloudWatch Logs
                │
                ▼
    Kinesis Data Firehose (real-time streaming)
                │
                ▼
    OpenSearch Service (indexing)
                │
                ▼
    OpenSearch Dashboards (visualization)
    └── UltraWarm → Cold (long-term retention + cost savings)
```

> 💡 **The algorithmic advantage of the inverted index** — OpenSearch's (Elasticsearch's) inverted index analyzes text word by word and maps which document each word appears in. Thanks to this structure, you can find "all documents containing a specific word" in O(log N) time. In contrast, an RDBMS needs a Full Table Scan to process a `LIKE '%keyword%'` query, which is O(N). This algorithmic difference is the fundamental reason "why full-text search uses OpenSearch." The inverted index was developed in the information retrieval field in the 1950s, and it's also the core of the Google search engine. Lucene (the library OpenSearch is based on) was developed by Doug Cutting in 2000.

> 📚 **The Netflix OpenSearch log-analytics case** — Netflix uses OpenSearch (formerly Elasticsearch) to analyze in real time the logs generated by thousands of microservices. In particular, when Netflix's Chaos Engineering tool, Chaos Monkey, injects failures into the infrastructure, engineers observe in real time on OpenSearch Dashboards how each service responds. Tens of terabytes of logs per day are processed through the Kinesis → Firehose → OpenSearch pipeline, with 30 days of logs retained cheaply on UltraWarm. Without this architecture, debugging thousands of microservices would have been impossible.

## Special-Purpose Databases — Mapping Scenario Keywords

On the exam, you must answer these services quickly by "scenario keyword → service" mapping.

**DocumentDB**: A managed document DB compatible with the MongoDB API. Keywords: "MongoDB-compatible," "JSON documents," "migrating an existing MongoDB workload." Note: DocumentDB is not a full fork of MongoDB but a compatibility layer. Some advanced MongoDB features aren't supported. Additional features are supported from version 6.0.

**Neptune**: A graph database. Supports the Gremlin (Property Graph) and SPARQL (RDF) query languages. Keywords: "social network," "recommendation system," "knowledge graph," "fraud detection (analyzing relationships between accounts)," "friend recommendation." Relationship traversal is the core. Specialized for multi-hop relationship traversal, where implementing with RDS JOINs makes performance degrade exponentially.

**Timestream**: A time-series-only DB. Keywords: "IoT sensor data," "server metrics," "time-series data," "automatic expiration." Time-based automatic data tiering (memory → SSD → magnetic). Built-in time-series functions (`time_series`, `interpolate`, `rate`, etc.).

**Keyspaces**: A managed service compatible with Apache Cassandra. Keywords: "Cassandra migration," "CQL (Cassandra Query Language)," "Wide-Column store." Runs Cassandra's distributed Wide-Column model fully managed. No node management needed.

**QLDB (Quantum Ledger Database)**: An immutable ledger DB. Every change is recorded as a cryptographically verifiable log. Keywords: "change-history audit," "financial ledger," "supply-chain tracking," "immutable log." The difference from blockchain is that QLDB is a centralized service (operated by AWS) and the trust authority is AWS.

| Service | Core Keywords | Technical Model | Confusion to Avoid |
|---------|---------------|-----------------|--------------------|
| DocumentDB | MongoDB, JSON documents | Document Store | Full MongoDB compatibility ≠ DocumentDB |
| Neptune | Social graph, recommendation, relationship traversal | Graph DB (Gremlin/SPARQL) | Don't confuse with relational DB |
| Timestream | IoT, time-series, metrics | Time-Series | DynamoDB TTL for time-series ≠ Timestream |
| Keyspaces | Cassandra, CQL, Wide-Column | Wide-Column Store | Different query model from DynamoDB |
| QLDB | Immutable ledger, audit log | Ledger (Immutable) | Different from blockchain (decentralized) |

Comparison with other clouds:

| AWS | GCP | Azure | Purpose |
|-----|-----|-------|---------|
| ElastiCache Redis | Cloud Memorystore (Redis) | Azure Cache for Redis | General-purpose cache |
| ElastiCache Memcached | Cloud Memorystore (Memcached) | - | Simple cache |
| MemoryDB | - | - | Durable in-memory DB |
| OpenSearch | Cloud Search / BigQuery | Azure Cognitive Search | Full-text search |
| Neptune | - | Azure Cosmos DB (Gremlin) | Graph DB |
| Timestream | BigQuery (time-series queries) | Azure Time Series Insights | Time-series |
| QLDB | - | Azure Confidential Ledger | Immutable ledger |

> ⚠️ **Can you use ElastiCache Redis as a message queue?** — Technically, yes. You can use Redis's List and Pub/Sub like a queue. However, it lacks features like SQS's message-retention guarantee, Dead Letter Queue, visibility timeout, Fan-out, and At-Least-Once delivery guarantee. The Streams data structure introduced in Redis 5.0 supports consumer-group-based message processing similar to Kafka, but it doesn't match the unlimited scalability and fully managed nature of SQS/SNS. On the exam, if you need "durable message delivery," it's SQS; "real-time distributed streaming," Kinesis; "general cache/session," ElastiCache Redis.

## Setting Up ElastiCache Redis via the CLI

```bash
# ElastiCache Redis (Multi-AZ, Cluster Mode Disabled - session/cache use)
aws elasticache create-replication-group \
  --replication-group-id prod-redis \
  --replication-group-description "Production cache" \
  --engine redis \
  --engine-version 7.1 \
  --cache-node-type cache.r7g.large \
  --num-cache-clusters 3 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --cache-subnet-group-name redis-subnet-group \
  --security-group-ids sg-xxx \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled \
  --auth-token "StrongAuthToken123!" \
  --snapshot-retention-limit 7

# ElastiCache Redis Cluster Mode Enabled (3 shards, 2 Replicas per shard)
aws elasticache create-replication-group \
  --replication-group-id prod-redis-cluster \
  --replication-group-description "Clustered Redis" \
  --engine redis \
  --cache-node-type cache.r7g.large \
  --num-node-groups 3 \
  --replicas-per-node-group 2 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled

# Add Redis Cluster capacity (add shards - live scaling)
aws elasticache modify-replication-group-shard-configuration \
  --replication-group-id prod-redis-cluster \
  --node-group-count 5 \
  --apply-immediately

# Create a MemoryDB for Redis cluster
aws memorydb create-cluster \
  --cluster-name prod-memorydb \
  --node-type db.r6g.large \
  --acl-name open-access \
  --subnet-group-name memorydb-subnet-group \
  --security-group-ids sg-xxx \
  --num-shards 3 \
  --num-replicas-per-shard 2 \
  --engine-version 7.0

# OpenSearch domain (3 data nodes + 3 dedicated masters)
aws opensearch create-domain \
  --domain-name prod-logs \
  --engine-version OpenSearch_2.13 \
  --cluster-config '{
    "InstanceType": "r6g.large.search",
    "InstanceCount": 3,
    "DedicatedMasterEnabled": true,
    "DedicatedMasterType": "r6g.large.search",
    "DedicatedMasterCount": 3,
    "ZoneAwarenessEnabled": true,
    "ZoneAwarenessConfig": {"AvailabilityZoneCount": 3}
  }' \
  --ebs-options '{"EBSEnabled":true,"VolumeType":"gp3","VolumeSize":500}' \
  --node-to-node-encryption-options '{"Enabled":true}' \
  --encryption-at-rest-options '{"Enabled":true}' \
  --domain-endpoint-options '{"EnforceHTTPS":true}'

# Enable OpenSearch UltraWarm (cost savings for old logs)
aws opensearch update-domain-config \
  --domain-name prod-logs \
  --cluster-config '{
    "WarmEnabled": true,
    "WarmType": "ultrawarm1.medium.search",
    "WarmCount": 2
  }'

# Monitor Redis cache hit rate (CloudWatch)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name CacheHits \
  --dimensions Name=ReplicationGroupId,Value=prod-redis \
  --start-time 2025-05-26T00:00:00Z \
  --end-time 2025-05-26T23:59:59Z \
  --period 300 \
  --statistics Sum
```

## Wrapping Up

In-memory data stores began at the physical limits of speed. The fact that DRAM is 1000× faster than an NVMe SSD is the reason caches exist. ElastiCache Redis, with its rich data structures and Multi-AZ HA, is the answer for nearly every caching scenario. Choose Memcached only when you need a simple cache and want to maximize multi-threaded CPU efficiency. DAX is DynamoDB-only and minimizes code changes. Choose MemoryDB when you need lossless durability while keeping the Redis API. OpenSearch is the standard answer for full-text search and log analytics.

Tomorrow is the day we review all of Week 5. RDS Multi-AZ vs Read Replica, Aurora Global DB vs RDS Cross-Region Replica, DAX vs ElastiCache, GSI vs LSI — we'll firmly cement these confusing comparisons through scenario questions.

---

## 📝 연습 문제

**문제 1.** You want to store a web application's session data and implement a stateless architecture where the session must be readable from servers other than the one the user logged in on. What is the most suitable service?

A) ElastiCache Memcached — it's a simple cache, so it's fast
B) ElastiCache Redis — it supports replication and HA and is ideal as a session store
C) RDS MySQL — persist sessions with a relational DB
D) DynamoDB — store sessions with NoSQL

**정답: B**

해설: For a session store, ElastiCache Redis is the standard answer. Fast reads/writes (microseconds to milliseconds), Multi-AZ HA, session-expiration automation via TTL, and a structure accessible concurrently by multiple application servers are all in place. Memcached has no replication or HA, making it unsuitable as a session store (a node failure loses all sessions = forced user logout). RDS is excessively heavy and has connection-count limits. DynamoDB is technically possible too, but it isn't as natural as Redis in terms of TTL and performance.

---

**문제 2.** A read-intensive application using DynamoDB must cut response time to the microsecond level. The data doesn't change often, and fast response matters more than strong consistency. What is the most suitable solution?

A) Add ElastiCache Redis in front of DynamoDB with the Cache-Aside pattern
B) Increase DynamoDB Provisioned WCU/RCU by 10×
C) Add a DAX cluster in front of DynamoDB
D) Enable DynamoDB Global Tables to distribute reads regionally

**정답: C**

해설: DAX is a DynamoDB-only in-memory cache that provides microsecond responses. Just changing the SDK means you don't have to implement cache logic yourself. A can achieve microseconds too, but you must implement the Cache-Aside logic yourself and it lacks full compatibility with the DynamoDB API. B doesn't reduce latency by raising cost (DynamoDB's own latency is in milliseconds). D distributes reads geographically but doesn't guarantee microsecond responses.

---

**문제 3.** What is the difference between ElastiCache Redis Cluster Mode Enabled and Cluster Mode Disabled?

A) Cluster Mode Enabled doesn't support Multi-AZ
B) Cluster Mode Enabled divides data across multiple shards to scale to multiple TB, with restrictions on Multi-Key operations
C) Cluster Mode Disabled works only in a single AZ
D) Cluster Mode Enabled provides the same functionality as Memcached

**정답: B**

해설: Cluster Mode Enabled distributes data by dividing 16,384 slots across multiple shards. Each shard has an independent Primary + Replica structure, so total capacity becomes shards × node capacity. However, Multi-Key operations (MGET, MSET, transactions) require all keys to be in the same slot. Cluster Mode Disabled is a single shard scalable only up to the maximum node size, but it has no restrictions on Multi-Key operations. A, C, and D are all incorrect statements.

---

**문제 4.** In a social network service, multi-hop relationship queries like "people connected to B among the friends of A's friends" are frequent. What is the most suitable database?

A) DynamoDB (implement relationships with a GSI)
B) RDS Aurora (traverse relationships with JOINs)
C) Amazon Neptune (graph DB)
D) OpenSearch (index relationship documents)

**정답: C**

해설: Multi-hop relationship traversal (Graph Traversal) is a textbook use case for the graph database Neptune. Neptune efficiently handles "friends of friends," "N-hop relationships," "shortest path," and more with the Gremlin (Property Graph) and SPARQL (RDF) query languages. Implementing with JOINs in RDS makes performance degrade exponentially as the hops increase. Implementing relationships with a DynamoDB GSI works up to 1-hop relationships but is inefficient for multi-hop. OpenSearch is a search engine and is unsuitable for relationship traversal.

---

**문제 5.** In an application using the Redis API, cache data must never be lost on a Primary failure. Session and shopping-cart data are stored in Redis, and if this data is lost, users are logged out. Which service should you choose?

A) ElastiCache Redis (Multi-AZ)
B) ElastiCache Redis (Cluster Mode Enabled)
C) MemoryDB for Redis
D) ElastiCache Redis (AOF enabled)

**정답: C**

해설: ElastiCache Redis's Multi-AZ replication is asynchronous, so recent writes can be lost on a Primary failure. Even enabling AOF, the essential limit of asynchronous replication remains. MemoryDB for Redis synchronously persists all writes to multiple AZs via a Multi-AZ transaction log, so there's no data loss. It can use the Redis API as-is, so code changes are also minimized. The keyword "never lost" points to MemoryDB.

---

**문제 6.** Which architecture enables real-time collection of application logs to allow "searching log messages containing a specific error code," "visualizing error distribution by time period," and "detecting anomalous access patterns based on IP"?

A) CloudWatch Logs → S3 → Athena queries
B) CloudWatch Logs → Kinesis Data Firehose → Amazon OpenSearch Service → OpenSearch Dashboards
C) CloudWatch Logs → RDS MySQL (logs table) → BI tool
D) DynamoDB Streams → Lambda → S3

**정답: B**

해설: Full-text search (containing specific text), aggregation analytics (distribution by time period), and anomaly detection (pattern search) are all OpenSearch's strengths. OpenSearch Dashboards (formerly Kibana) even provides real-time visualization. Kinesis Data Firehose is the standard pipeline that streams logs to OpenSearch in real time. A can do log analytics but isn't real-time and has limited full-text search. C is inefficient for full-text text search and isn't real-time. D is unrelated to this scenario.

---

**문제 7.** In the Cache-Aside pattern, what is it called when hundreds of concurrent requests all rush to the DB the moment a frequently read cache item's TTL expires, and what is the most effective mitigation?

A) The Hot Partition phenomenon. Solve it with DynamoDB Adaptive Capacity
B) Thundering Herd (Cache Stampede). Solve it by adding random jitter to the TTL or with a Mutex Lock
C) The Cold Start phenomenon. Solve it with Provisioned Concurrency
D) Read-After-Write Inconsistency. Solve it with strongly consistent reads

**정답: B**

해설: Thundering Herd (Cache Stampede) is the phenomenon where all requests rush to the DB when a popular cache item's TTL expires simultaneously. Countermeasures: (1) add random jitter to the TTL — `TTL = base_ttl + random(0, max_jitter)` to spread out expiration times, (2) Mutex Lock — use Redis's `SET NX` so only the first request queries the DB while the rest wait, (3) Probabilistic Early Expiration — probabilistically refresh in advance just before TTL expiry. A is a DynamoDB partition problem. C is a Lambda initialization delay. D is a distributed-DB consistency problem.

---
