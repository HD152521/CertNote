# Day 3 - ElastiCache: How an In-Memory Cache Saves Your Database

Caches exist at every layer of a computer system. CPU L1/L2/L3, the OS page cache, the disk controller cache, the browser cache, the CDN — and between the application and the DB sits an **in-memory cache**. ElastiCache is the managed service that fills that spot, offering two engines, Redis and Memcached, from the same console. Both are in-memory, but their design philosophies are opposite — Redis bills itself as a "data structure server," and Memcached as a "simple distributed memory pool." This difference is the point you need to distinguish both on the exam and in practice.

On DVA-C02, ElastiCache usually shows up in two forms. ① "DB load is too high + the same queries repeat" → introduce a cache. ② "Share sessions across multiple EC2/ECS instances" → ElastiCache Redis. And one level deeper, it asks "why is the cache showing stale data" — that is, the cache invalidation strategy. Today's material covers all three layers.

## Why Caches Exist — An Application of Locality of Reference

The fundamental principle that makes an external cache like ElastiCache work is **locality of reference**, discovered by computer architecture in the 1960s. Temporal locality says "recently accessed data is likely to be accessed again soon," and spatial locality says "when you access one piece of data, nearby data is likely to be accessed too." In web services, objects like **user profiles, product information, session data, and popular posts** all have very high temporal locality — a single user views their own profile N times within 5 minutes.

A single disk I/O on a DB is 100μs ~ 1ms even on SSD, and 5-10ms on HDD. Fetching the same data from RAM takes under 100ns. That is a **difference of roughly 10,000x to 100,000x**. Picture an SNS feed where one page render needs 100 objects: the difference between making 100 round trips to the DB and 100 round trips to the cache splits page response time into something like 5 seconds vs. 5ms.

The standard formula for quantifying cache effect is Average Memory Access Time (AMAT) = Hit_time + Miss_rate × Miss_penalty. If Hit_time is 0.5ms, Miss_rate is 5%, and Miss_penalty is 50ms (DB lookup + cache store), then AMAT = 0.5 + 0.05 × 50 = 3ms. Lowering Miss_rate to 1% drops AMAT to 1ms. This is why average latency can drop sharply from even a 1-2% improvement in cache hit ratio. In a "latency didn't drop after introducing the cache" scenario, suspect the hit ratio.

## Redis vs Memcached: A Difference in Design Philosophy

Memcached was created in 2003 by Brad Fitzpatrick of LiveJournal, and it does exactly one thing: "distributed memory cache." Its data model is simply key → byte string, with a single TTL option. It is written multithreaded, so throughput grows linearly with the number of cores on a node.

Redis was created in 2009 by Salvatore Sanfilippo and bills itself as a **data structure server**.

Beyond String, it provides 9 data structures in memory — List, Hash, Set, Sorted Set, Stream, HyperLogLog, Geo, Bitmap — and supports rich operations of O(log N) or better on each.

Because Redis is built on a **single-threaded event loop** (libevent-based), atomic operations come naturally, and in exchange you need multiple instances/shards to use more than one core.

| Dimension | Redis | Memcached |
|------|-------|-----------|
| Data model | 9 structures (String, List, Hash, Set, ZSet, Stream, HLL, Geo, Bitmap) | String only |
| Threading model | Single-threaded event loop + I/O threads (6.0+) | Multithreaded |
| Persistence | RDB snapshots + AOF | None |
| Replication | Primary-Replica, asynchronous | None (client-side sharding only) |
| Clustering | Cluster Mode (16384 hash slots) | None (consistent hashing is on the client) |
| Pub/Sub | ✅ | ❌ |
| Transactions | MULTI/EXEC, Lua script | ❌ |
| Key eviction policy | Varied (8 kinds, e.g. volatile-lru, allkeys-lfu) | LRU only |
| Max value size | 512MB | 1MB (default) |

The reason Redis is fast despite being single-threaded is that every command is an **in-memory O(1) ~ O(log N) operation**, and network I/O is handled asynchronously on libevent's epoll. A single core can handle 100,000 QPS because each command takes only microseconds, so context-switch cost would actually be a loss. From Redis 6.0, only network I/O is split off into a separate thread pool ("I/O threading") to use multiple cores to some extent, but command execution itself remains single-threaded. This design gets you both atomicity guarantees and performance.

| Decision tree |
|----------|
| Need persistence/backup → **Redis** |
| Need Multi-AZ HA → **Redis** |
| Need data structures like Sorted Set/Hash/Stream → **Redis** |
| Simple key-value + large volume + multi-core utilization → **Memcached** |
| Stateless cache where it doesn't matter if the cache dies → **Memcached** (Redis is also possible) |

The answer to the scenario "build a game leaderboard with ElastiCache" is the Redis Sorted Set. ZADD/ZRANGE/ZREVRANK run in O(log N), handling a leaderboard of hundreds of thousands of players in milliseconds. It's hard to implement the same functionality with Memcached (you'd have to load everything and sort it every time). When you see the words "leaderboard," "ranking," or "real-time score," choose Redis.

## The 5 Caching Strategies — Five Ways to Use the Same Tool

Even on the same ElastiCache instance, system consistency and performance differ completely depending on the policy of **what you fill and what you evict, and when**. The exam asks you to clearly distinguish these 5 strategies.

### Lazy Loading (Cache-Aside)

The most widely used pattern. **The cache is filled only when a read request comes in.** On a miss, it queries the DB and then stores the result in the cache.

```python
def get_product(product_id):
    cached = cache.get(f'product:{product_id}')
    if cached:
        return json.loads(cached)          # cache hit
    item = db.get_item(Key={'id': product_id})['Item']
    cache.setex(f'product:{product_id}', 3600, json.dumps(item))  # 1h TTL
    return item
```

- Pro: only data that was actually queried is cached → memory efficient
- Con: the first request is always slow (cold miss). Also, the cache doesn't know when the DB is updated, so there's a risk of **stale data**

### Write-Through

**Updates the DB and the cache at the same time** at write time. The cache is always up to date.

```python
def update_product(product_id, data):
    db.put_item(Item=data)
    cache.setex(f'product:{product_id}', 3600, json.dumps(data))
```

- Pro: guarantees data freshness
- Con: data that will never be read also goes into the cache → wasted memory. Write latency increases

### Write-Back (Write-Behind)

On write, only the cache is updated first, and the data is **flushed to the DB asynchronously in the background**. Maximizes write performance.

- Pro: very high write throughput
- Con: if the cache dies, unapplied data is lost. Data consistency is hard to guarantee, so rather than implementing it directly with ElastiCache, a pattern with a queue like Kafka/Kinesis in between is recommended
- It's important to know it as an anti-pattern

### Read-Through

When the application makes a request to the cache library, **the cache library automatically goes to the DB itself**. The user code only calls cache.get.

- Pro: simple calling code
- Con: ElastiCache doesn't support native read-through — it is implemented at the framework level, such as Hibernate L2 cache or Spring Cache

### Refresh-Ahead

**Refreshes in the background just before the TTL expires** so that users never see a cache miss.

- Pro: constant user latency
- Con: if the prediction is off, unnecessary DB calls. Applying it to every key makes the load spike

| Strategy | Data freshness | Write cost | Memory efficiency | Real-world frequency |
|------|--------------|----------|-------------|----------|
| Lazy Loading | Weak (stale possible) | Low | High | ★★★★★ |
| Write-Through | Strong | High | Low (everything is cached) | ★★★ |
| Write-Back | Weak | Very low | Low | ★ |
| Read-Through | Weak | Low | High | ★★ |
| Refresh-Ahead | Strong | Medium | Medium | ★ |

The reason cache invalidation is hard is that **when a distributed system's source of truth is replicated in multiple places, propagating a change consistently to every replica is inherently a distributed consensus problem.** In an ElastiCache + RDS combination, the trap that "data updated with a direct UPDATE on RDS is not refreshed in the cache" leads to real-world incidents. The solutions are ① force every write to go through the application ② publish cache invalidation events through CDC such as DDB Streams/Debezium ③ limit the stale window with a short TTL.

When a popular post's cache expires, thousands of concurrent requests rushing at the DB is called a thundering herd. Facebook introduced a **lease token** mechanism to handle this in its Memcached clusters (the "Scaling Memcache at Facebook" paper, NSDI 2013). A token is issued only to the first miss request, and the other requests wait briefly or use stale data. In Redis, this pattern is implemented with `SET NX EX` (the distributed lock pattern) or a single-flight pattern. Using Lazy Loading naively on its own causes a similar problem at the moment popular content expires.

## Redis Cluster Mode: Distributing Data Across 16,384 Slots

ElastiCache Redis has two topologies.

**Cluster Mode Disabled**: a single shard with 1 primary + up to 5 replicas. All keys go to one node, so the memory limit equals the instance's memory size (e.g., cache.r7g.xlarge = 25GB).

**Cluster Mode Enabled**: multiple shards (up to 500) × each (1 primary + up to 5 replicas). Redis's own hash slot mechanism distributes keys across 16,384 slots and maps slots to shards. The key hashing function is CRC16(key) mod 16384.

```
Key "user:123"
   ↓ CRC16
Slot 5474
   ↓ mapping table
Shard 3
   ↓
Shard 3's primary node
```

16,384 is not an arbitrary number. According to design notes by Redis author antirez (Salvatore Sanfilippo), 16,384 is the balance point of the following three things.

- Every node must hold the slot mapping information, and 16K slots fit in a bitmap of ~2KB.
- Since the maximum number of Redis cluster nodes was designed at around 1,000, a slot-to-node ratio of 16:1 gives good evenness of data distribution.
- It also affects message size when cluster messages are exchanged over the gossip protocol.

Enabling Cluster Mode puts **constraints on transactions and multi-key operations.** `MULTI/EXEC` or `MGET` require all keys to be in the same slot. The solution is a **hash tag**, which forces only the part inside `{...}` in the key name to be used for hashing. Example: `user:{123}:profile` and `user:{123}:settings` both hash only the `{123}` part and so land in the same slot, so `MGET user:{123}:profile user:{123}:settings` is possible.

| Mode | Memory limit | Throughput | Complexity | Scenario |
|------|-------------|--------|--------|---------|
| Cluster Mode Disabled | Single node memory (up to ~635GB) | Single primary throughput | Low | General cache, sessions |
| Cluster Mode Enabled | Number of shards × node memory (tens of TB possible) | Scales linearly with the number of shards | High (hash tags, client support) | Large-scale cache, global services |

> ⚠️ **Trap**: When migrating to Cluster Mode Enabled, the **client library must support the Cluster protocol.** For Java, the Jedis Cluster client; for Python, `redis-py-cluster` (or RedisCluster in `redis-py 4.x`). Connecting to the cluster endpoint with an ordinary Redis client errors out because it can't handle MOVED/ASK redirects. On the exam, "after migrating to ElastiCache, some commands fail" → check the client's cluster support.

## Redis Persistence: The RDB and AOF Trade-off

The reason Redis offers persistence options even though it is in-memory is to avoid a **cache cold start on restart**. If the cache is empty, all requests rush to the DB and cause a thundering herd incident. There are two persistence mechanisms.

**RDB (Redis Database)**: dumps the entire memory to disk as a **binary snapshot** at set intervals (e.g., when 100 keys change within 5 minutes). Small file size and fast restore. Downside: data after the last snapshot is lost.

**AOF (Append-Only File)**: appends every write command to disk as a text log. Data loss is nearly 0 (with the `fsync everysec` option). Downside: large file size, and restore requires replaying every command, so it is slow.

ElastiCache supports **automatic backups** (one RDB snapshot per day, stored in S3) and **manual backups**. AOF is disabled in ElastiCache Redis Cluster Mode Enabled, and Multi-AZ replicas are recommended instead.

The reasons ElastiCache doesn't recommend AOF are ① fsync cost reduces throughput by 30-50% ② the same durability can be obtained with Multi-AZ replicas ③ the service is unavailable during AOF replay time. In other words, for cache use the cost-benefit doesn't add up.

MemoryDB (launched in 2021) is a separate service that solves exactly this problem, providing strongly consistent + durable Redis with a **multi-AZ transaction log** (a mechanism similar to DynamoDB). The price is about 2-3x that of ElastiCache.

## Session Management: ElastiCache's Killer Use Case

In a stateful web application with multiple EC2/ECS instances behind an ALB, if a user is routed to a different instance on every request, a **session data sharing problem** arises. In the past it was worked around with ALB sticky sessions, but this has the problems of ① session loss when an instance goes down ② uneven load ③ conflict with Auto Scaling.

If you externalize sessions to ElastiCache Redis, every instance sees the same cache. Implementation pattern:

```python
import redis, secrets, json, time

cache = redis.Redis(host='session-cache.xxxx.cache.amazonaws.com',
                    port=6379, ssl=True, decode_responses=True)

SESSION_TTL = 1800  # 30 minutes

def create_session(user_id):
    sid = secrets.token_urlsafe(32)
    data = {'user_id': user_id, 'created_at': time.time(),
            'csrf_token': secrets.token_urlsafe(16)}
    cache.setex(f'sess:{sid}', SESSION_TTL, json.dumps(data))
    return sid

def get_session(sid):
    raw = cache.get(f'sess:{sid}')
    if raw is None:
        return None
    # sliding window: refresh the TTL on every access (keeps the active session)
    cache.expire(f'sess:{sid}', SESSION_TTL)
    return json.loads(raw)

def invalidate_session(sid):
    cache.delete(f'sess:{sid}')  # logout
```

If you manage sessions with ALB sticky sessions, when one node goes down, the sessions of all users tied to that node disappear. If you keep sessions in ElastiCache Redis and use Multi-AZ + automatic failover, sessions survive even when an instance goes down.

## Security: AUTH, In-Transit Encryption, IAM Integration

ElastiCache security consists of three layers.

**Network**: only VPC-internal endpoints are provided (no public endpoint). Use Security Groups to allow port 6379 (Redis)/11211 (Memcached) only from the application SG.

**Authentication**: Redis uses an **AUTH token** (Redis 5+) or **RBAC** (Redis 6+, ElastiCache 6.0+). RBAC can grant per-user command/key ACLs (e.g., a read-only user is allowed only GET/HGET). Since 2023, **IAM authentication for ElastiCache Redis** has been added and works much like RDS IAM Auth — allow `elasticache:Connect` in the IAM policy + map IAM authentication to the Redis user.

**Encryption**:
- In-transit: TLS enable option (set at creation; changing it afterward requires backup/restore)
- At-rest: EBS volume encryption with KMS

> ⚠️ **Trap**: ElastiCache **cannot have a public IP.** To connect from outside, use one of three: ① VPN ② Direct Connect ③ EC2 bastion + SSH tunnel. The answer to the scenario "access ElastiCache directly from on-premises" is VPN/Direct Connect.

## ElastiCache Serverless (GA in 2023)

Traditional ElastiCache requires you to choose a node class (`cache.r7g.large`, etc.). The Serverless option delegates capacity decisions to AWS and **bills by ECPU (read/write units) + GB stored.** It is advantageous for workloads with unpredictable traffic or frequent short bursts. Downside: the unit price is higher than reserved nodes, so it is a loss for steady traffic.

| Dimension | ElastiCache (Provisioned) | ElastiCache Serverless |
|------|---------------------------|------------------------|
| Capacity decision | Manual (node class) | Automatic |
| Billing | Per node-hour | ECPU + GB-hours |
| Minimum cost | One node per hour | Very low |
| Max scaling | Manual scale-up/out | Automatic |
| Scenario | Predictable workloads | Highly variable workloads |

## MemoryDB vs ElastiCache Redis: Cache vs. Primary DB

MemoryDB is a **Redis-compatible in-memory DB** launched in 2021. It uses the same Redis API as ElastiCache, but the internal architecture differs — every write is synchronously replicated to a **multi-AZ transaction log** (DynamoDB-based) before the ack is returned. In other words, it provides the same RPO≈0 durability as RDS Multi-AZ at millisecond-level latency.

| Item | ElastiCache Redis | MemoryDB |
|------|-------------------|----------|
| Persistence | Optional (RDB/AOF/replica) | Standard (multi-AZ tx log) |
| Consistency | Replicas are eventually consistent | Strongly consistent |
| Write latency | Hundreds of μs | A few ms (synchronous tx log replication) |
| Read latency | μs | μs (primary), sub-ms (replica) |
| Price | Baseline | 2-3x that of ElastiCache |
| Suitable use | Cache, sessions | Primary DB for microservices |

For a new microservice where "single-entity reads/updates are the main workload + millisecond responses are needed + DB-grade durability," MemoryDB can be more suitable than RDS. The unit price is higher, but it simplifies operating a DB Proxy/replicas/backups. When the keyword combination "microsecond latency + durable" appears, consider MemoryDB.

## Summary

ElastiCache looks simple, but decisions pile up across four layers: **engine choice (Redis vs Memcached) → topology choice (Cluster Mode On/Off) → caching strategy (Lazy/Write-Through/...) → invalidation mechanism.** Each layer's choice affects consistency, performance, and cost differently, so exam scenarios ask "which combination is optimal for the given requirements."

Here are the two decision rules for solving scenarios, restated.

- **If you need any one of persistence, Multi-AZ, or complex data structures, choose Redis.**
- **If there is a risk of stale cache, don't use lazy loading alone.** Keep the TTL short and combine it with event-based invalidation or write-through.

In the next post we look at the internal structure of Aurora — a separate engine that keeps only RDS compatibility while completely redesigning the storage and replication layers — and Aurora Serverless v2.

---

## 📝 Practice Questions

**Question 1.** A game company wants to implement a real-time global leaderboard. It must sort the scores of 100 million players in real time and look up a specific user's rank within milliseconds. What is the most suitable tool?

A) ElastiCache Memcached + client-side sorting
B) ElastiCache Redis Sorted Set (ZADD/ZREVRANK)
C) DynamoDB GSI
D) Aurora MySQL + ORDER BY

**Answer: B**

Explanation: The Redis Sorted Set is a data structure designed for exactly this use case. ZADD is O(log N), and ZREVRANK/ZRANGE are also O(log N) — even with 100 million entries, it takes about 27 comparisons. Internally it maintains a skip list + hash table at the same time, so both sorting and key lookups are fast. A) Memcached has no data structures, and fetching everything to the client and sorting is unrealistic. C) DynamoDB GSI has N+1 queries and high throughput cost. D) Aurora ORDER BY takes minutes to sort 100 million rows.

---

**Question 2.** What is the biggest drawback of the Lazy Loading caching strategy?

A) All data is stored in the cache, causing memory shortage
B) On a cache miss the first request has long latency, and there is a risk of stale data when the DB is updated
C) The implementation is complex
D) It doesn't work with Multi-AZ

**Answer: B**

Explanation: Lazy Loading has ① a slow first request due to a cold miss ② stale data returned because the cache doesn't know when the DB is updated outside the cache. A is the opposite — Lazy Loading stores only queried data, so memory efficiency is actually good. C is also the opposite — it is the simplest to implement. D is irrelevant. Solution: a short TTL + event-based invalidation + combine with write-through.

---

**Question 3.** You want to solve the session sharing problem in a web application with multiple EC2 instances behind an ALB. What is the most appropriate method?

A) Enable ALB sticky sessions
B) Store sessions in ElastiCache Redis
C) Store sessions on each EC2's local file system
D) Store session JSON files in S3

**Answer: B**

Explanation: B solves all the problems of sticky sessions (session loss when an instance goes down, uneven load). ElastiCache Redis gives millisecond responses + session survival on failover with Multi-AZ + automatic expiry with TTL. A) Sticky sessions are a short-term fix, but if one instance dies, all sessions tied to it are lost. C) Local files can't be seen by other instances (the same problem to begin with). D) S3 has per-call cost + hundreds of ms of latency, which makes it unsuitable for session lookups.

---

**Question 4.** In ElastiCache Redis Cluster Mode Enabled, the command `MGET user:1 user:2 user:3` returns the error "CROSSSLOT Keys in request don't hash to the same slot". What is the most appropriate solution?

A) Change Cluster Mode to Disabled
B) Use hash tags — change the keys to `{user}:1`, `{user}:2`, etc., so the same group shares the same tag (`{user}`)
C) Call GET N times instead of MGET
D) Switch to Memcached

**Answer: B**

Explanation: In Cluster Mode, a multi-key command requires all keys to be in the same slot. A hash tag, where only the part inside `{...}` is hashed, can force them into the same slot. Example: `cart:{user123}:item1` and `cart:{user123}:item2` both hash on `user123` and so share a slot. A) Turning off Cluster Mode is a big change that gives up memory scalability. C) works, but performance degrades from more round trips — which can be mitigated with pipelining, though that is a less fundamental fix than designing hash tags. D) is an excessive change.

---

**Question 5.** A company suffers a thundering herd where the cache is empty and traffic spikes to the DB every time an ElastiCache Redis node restarts. Which of the following would NOT help?

A) Enable Multi-AZ (fail over to a replica, keep the cache)
B) Enable AOF persistence (restore after restart)
C) An application-side single-flight pattern (limit concurrent DB lookups to 1 per key)
D) Switch to Memcached

**Answer: D**

Explanation: D actually makes it worse — Memcached has no persistence and no Multi-AZ. On restart the entire cache is lost, so the thundering herd gets even worse. A) Multi-AZ fails over to a replica immediately when the primary goes down, keeping the cache (the most direct solution). B) AOF allows restore after restart (though ElastiCache's AOF is limited — Multi-AZ replicas are recommended). C) single-flight is an application-level defense that works with any cache.

---

**Question 6.** Which of the following is NOT a correct difference between Redis and Memcached?

A) Redis supports data persistence but Memcached does not
B) Redis supports various data structures (List, Hash, Set, Sorted Set, etc.)
C) Memcached is multithreaded, Redis is a single-threaded event loop
D) Memcached supports Multi-AZ automatic failover

**Answer: D**

Explanation: Memcached does not support Multi-AZ. Clustering is possible but there is no automatic failover — when a node goes down, the client rehashes (consistent hashing). A), B), and C) are all correct. ElastiCache exam questions almost always ask for the "Multi-AZ/persistence/complex data structures → Redis" mapping.
