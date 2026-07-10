# Day 3 - ElastiCache: How In-Memory Cache Keeps Databases Alive

Cache exists at every layer of computer systems. CPU L1/L2/L3, OS page cache, disk controller cache, browser cache, CDN — and between applications and DB sits **in-memory cache**. ElastiCache is the managed service filling that role, providing Redis and Memcached from the same console. Both are in-memory but their design philosophies are opposite — Redis claims "data structure server," Memcached claims "simple distributed memory pool." This difference is the most-asked point in both exams and operations.

In DVA-C02, ElastiCache appears typically two ways: ① "DB load too high + same query repeats" → add cache ② "Multiple EC2/ECS instances share session" → ElastiCache Redis. Going deeper, "why is cache showing stale data" — cache invalidation strategy gets asked. Today covers all three levels.

## Why Cache Exists: Applying Locality of Reference

The fundamental principle behind external cache like ElastiCache is **locality of reference** from 1960s computer architecture. Temporal locality: "recently accessed data is likely accessed again soon." Spatial locality: "accessing one piece makes nearby pieces likely accessed." In web services, **user profiles, product info, session data, popular posts** all have very high temporal locality — a user checks their profile N times in 5 minutes.

A single DB disk I/O is 100μs ~ 1ms even on SSD, 5-10ms on HDD. The same data from RAM is < 100ns. **About 10,000-100,000x difference**. Consider an SNS feed needing 100 objects per page render — 100 round trips to DB vs 100 through cache is the difference between 5-second vs 5-millisecond page response.

> 💡 **Related Theory**: The standard formula quantifying cache benefit is Average Memory Access Time (AMAT) = Hit_time + Miss_rate × Miss_penalty. If Hit_time is 0.5ms, Miss_rate is 5%, Miss_penalty is 50ms (DB query + cache store), then AMAT = 0.5 + 0.05 × 50 = 3ms. Dropping Miss_rate to 1% gives AMAT = 1ms — average latency halves from just 1-2% hit ratio improvement. Exams frame "cache added but latency unchanged" → suspect hit ratio.

## Redis vs Memcached: Difference Made by 2003 vs 2009

Memcached, made 2003 by Brad Fitzpatrick at LiveJournal, is precisely "distributed memory cache, nothing more." Data model: simple key → byte string, one TTL option. Multithreaded, so throughput scales linearly with cores. Redis, made 2009 by Salvatore Sanfilippo, claims "data structure server." Beyond String, offers List, Hash, Set, Sorted Set, Stream, HyperLogLog, Geo, Bitmap — 9 structures in-memory with O(log N)+ rich operations each. Redis uses **single-threaded event loop** (libevent-based) making atomic operations natural, but to use multiple cores needs multiple instances/shards.

| Dimension | Redis | Memcached |
|------|-------|-----------|
| Data model | 9 structures (String, List, Hash, Set, ZSet, Stream, HLL, Geo, Bitmap) | String only |
| Thread model | Single-threaded event loop + I/O threads (6.0+) | Multithreaded |
| Persistence | RDB snapshots + AOF | None |
| Replication | Primary-Replica async | None (client-side sharding) |
| Cluster | Cluster Mode (16384 hash slots) | None (consistent hashing client-side) |
| Pub/Sub | ✅ | ❌ |
| Transactions | MULTI/EXEC, Lua script | ❌ |
| Key expiry policy | Varied (volatile-lru, allkeys-lfu etc. 8 types) | LRU fixed |
| Max value size | 512MB | 1MB (default) |

> 🔍 **Going Deeper**: Redis is single-threaded yet fast because all commands are **in-memory O(1) ~ O(log N) operations**, and network I/O handled asynchronously via epoll-based libevent. 100,000 QPS on one core is possible because command processing time is microseconds — context switch cost would actually hurt. Redis 6.0+ separates network I/O into separate thread pool ("I/O threading") partly using multi-core, but command execution stays single-threaded maintaining atomicity and performance together.

| Decision Tree |
|----------|
| Persistence/backup needed → **Redis** |
| Multi-AZ HA needed → **Redis** |
| Complex data structures (Sorted Set/Hash/Stream) needed → **Redis** |
| Simple key-value + massive volume + multi-core → **Memcached** |
| Stateless cache death-proof → **Memcached** (or Redis viable) |

> ⚠️ **Trap**: "ElastiCache for game leaderboard" is always Redis Sorted Set. ZADD/ZRANGE/ZREVRANK work O(log N) on millions of scores in ms. Memcached impossible (must load all, sort client-side). Exam: "leaderboard", "ranking", "real-time score" → Redis instant answer.

## Caching Strategies 5 Types: Using One Tool 5 Different Ways

Cache with same ElastiCache instance varies completely in consistency and performance depending on **when to fill what, when to evict what** policy. Exams distinctly separate these 5.

### Lazy Loading (Cache-Aside)

Most common pattern. **Fill cache only when read comes**. Miss → query DB → store in cache.

```python
def get_product(product_id):
    cached = cache.get(f'product:{product_id}')
    if cached:
        return json.loads(cached)          # cache hit
    item = db.get_item(Key={'id': product_id})['Item']
    cache.setex(f'product:{product_id}', 3600, json.dumps(item))  # 1h TTL
    return item
```

- Advantage: Only queried data cached → memory efficient
- Disadvantage: First request always slow (cold miss). DB updates unknown to cache → **stale data** risk

### Write-Through

**Simultaneously update DB and cache at write time**. Cache always latest.

```python
def update_product(product_id, data):
    db.put_item(Item=data)
    cache.setex(f'product:{product_id}', 3600, json.dumps(data))
```

- Advantage: Data freshness guaranteed
- Disadvantage: Unread data fills cache → memory waste. Write latency increases

### Write-Back (Write-Behind)

**Immediately update cache only, asynchronously flush to DB in background**. Write throughput maximized.

- Advantage: Write throughput very high
- Disadvantage: Cache death loses unflushed data. Consistency hard — ElastiCache direct implementation discouraged over queue (Kafka/Kinesis) pattern
- Exam: rarely appears but anti-pattern awareness important

### Read-Through

**Application calls cache library, cache library auto-reaches DB**. User code just `cache.get`.

- Advantage: Calling code simple
- Disadvantage: ElastiCache no native read-through — only framework level (Hibernate L2 cache, Spring Cache)

### Refresh-Ahead

**Pre-refresh in background just before TTL expires**, hiding cache miss from user.

- Advantage: User latency consistent
- Disadvantage: Prediction misses → unnecessary DB calls. Applying to all keys explodes load

| Strategy | Data Freshness | Write Cost | Memory Efficiency | Real Use Frequency |
|------|--------------|----------|-------------|----------|
| Lazy Loading | Weak (stale possible) | Low | High | ★★★★★ |
| Write-Through | Strong | High | Low (all cached) | ★★★ |
| Write-Back | Weak | Very low | Low | ★ |
| Read-Through | Weak | Low | High | ★★ |
| Refresh-Ahead | Strong | Medium | Medium | ★ |

> 💡 **Related Theory**: Phil Karlton's famous line — "There are only two hard things in Computer Science: cache invalidation and naming things." Cache invalidation is hard because **when data replicas across distributed system, propagating changes consistently to all copies is fundamentally a distributed consensus problem**. ElastiCache + RDS combo trick: "RDS direct UPDATE not reflected in cache." Solution three ways: ① force all writes through app ② CDC (Debezium) broadcasts cache invalidation events ③ short TTL limits stale window.

> 📚 **Case Study**: 2010 Facebook's Memcached cluster faced thundering herd — popular post cache expiry moment hits thousands of concurrent requests overwhelming DB, DB down. Solution introduced: **lease token** mechanism (USENIX 2013 "Scaling Memcache at Facebook" paper). Only first miss gets token, others wait briefly or use stale data. Pattern in Redis becomes `SET NX EX` (distributed lock) or single-flight. Lazy Loading alone invites similar incidents on hot content expiry.

## Redis Cluster Mode: 16,384 Slot Data Distribution

ElastiCache Redis has two topologies.

**Cluster Mode Disabled**: 1 primary + max 5 replicas, single shard. All keys one node, memory limit = instance memory (e.g., cache.r7g.xlarge = 25GB).

**Cluster Mode Enabled**: Multiple shards (max 500) × each (1 primary + max 5 replicas). Redis native hash slot mechanism distributes keys across 16,384 slots, mapping slots to shards. Key hashing: CRC16(key) mod 16384.

```
Key "user:123"
   ↓ CRC16
Slot 5474
   ↓ mapping table
Shard 3
   ↓
Shard 3's primary node
```

> 🔍 **Going Deeper**: 16,384 not arbitrary. Redis author antirez (Salvatore Sanfilippo) design notes: ① slot mapping carried by all nodes, 16K slots = ~2KB bitmap sufficient ② Redis cluster max nodes ~1,000, so 16:1 slot/node ratio ensures balanced distribution ③ cluster messages via gossip protocol — message size influenced — this balance = 16,384. (Ref: GitHub antirez/redis issue #2576)

Enabling Cluster Mode restricts **transactions and multi-key operations**. `MULTI/EXEC` or `MGET` needs all keys same slot. Solution: **hash tag** — only `{...}` section of key name used for hashing. Example: `user:{123}:profile`, `user:{123}:settings` both hash on `{123}` landing same slot, making `MGET user:{123}:profile user:{123}:settings` possible.

| Mode | Memory limit | Throughput | Complexity | Scenario |
|------|-------------|--------|--------|---------|
| Cluster Mode Disabled | Single node memory (max ~635GB) | Single primary throughput | Low | General cache, session |
| Cluster Mode Enabled | Shard count × node memory (tens TB possible) | Linear with shard count | High (hash tag, client support) | Large cache, global service |

> ⚠️ **Trap**: Migrating to Cluster Mode requires **client library supporting Cluster protocol**. Java: Jedis Cluster client, Python: `redis-py-cluster` (or `redis-py 4.x`'s RedisCluster). Standard Redis client on cluster endpoint fails on MOVED/ASK redirects. Exam: "ElastiCache migrated, some commands fail" → check client cluster support.

## Redis Persistence: RDB and AOF Trade-off

Redis in-memory yet offers persistence to avoid cache cold-start on restart. Cache empty means all requests hit DB — thundering herd. Two mechanisms:

**RDB (Redis Database)**: Full memory **binary snapshot** to disk at intervals (e.g., 100 key changes per 5 min). Small file, fast restore. Downside: data post-snapshot lost.

**AOF (Append-Only File)**: All write commands **text log appended** to disk. Data loss near-zero (`fsync everysec`). Downside: large file, slow restore (replay all commands).

ElastiCache supports **automatic backups** (daily RDB snapshot, S3 storage) and **manual backups**. AOF disabled in ElastiCache Cluster Mode Enabled, Multi-AZ replica recommended instead.

> 🔍 **Going Deeper**: ElastiCache avoids AOF because ① fsync cost cuts throughput 30-50% ② Multi-AZ replica achieves same durability ③ AOF replay blocks service — cost-benefit fails for cache. MemoryDB (2021) exactly solves this: **multi-AZ transaction log** (DynamoDB-like) provides strongly consistent + durable Redis, priced ~2-3x ElastiCache.

## Session Management: ElastiCache's Killer Use Case

Stateful web apps with ALB-backed multiple EC2/ECS instances: user routed to different instance per request → **session data sharing problem**. Old workaround: ALB sticky session, but ① instance down loses session ② unbalanced load ③ clashes with autoscaling.

ElastiCache Redis externalizes session — all instances see same cache:

```python
import redis, secrets, json, time

cache = redis.Redis(host='session-cache.xxxx.cache.amazonaws.com',
                    port=6379, ssl=True, decode_responses=True)

SESSION_TTL = 1800  # 30 min

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
    # sliding window: refresh TTL on access (keep active session)
    cache.expire(f'sess:{sid}', SESSION_TTL)
    return json.loads(raw)

def invalidate_session(sid):
    cache.delete(f'sess:{sid}')  # logout
```

> 📚 **Case Study**: 2018 Slack ran ALB sticky session, one node died forcing 400k users to log out. Postmortem: switched to Redis-based session store (self-run). No similar incidents after. AWS ElastiCache Redis fills this role — Multi-AZ + auto-failover keeps session on instance down.

## Security: AUTH, In-Transit Encryption, IAM Integration

ElastiCache security layers three levels.

**Network**: VPC-internal endpoint only (no public endpoint). Security Group allows 6379 (Redis) / 11211 (Memcached) to app SG only.

**Authentication**: Redis **AUTH token** (5+) or **RBAC** (6+, ElastiCache 6.0+). RBAC grants per-user command/key ACLs (e.g., read-only user → GET/HGET only). Since 2023, **IAM auth for ElastiCache Redis** added, working like RDS IAM Auth — IAM policy grants `elasticache:Connect` + Redis user IAM-mapped.

**Encryption**:
- In-transit: TLS option (set at creation, post-change requires backup/restore)
- At-rest: KMS encrypts EBS volume

> ⚠️ **Trap**: ElastiCache **no public IP**. Outside access needs ① VPN ② Direct Connect ③ EC2 bastion + SSH tunnel. Exam: "on-premises access ElastiCache directly" → almost always VPN/Direct Connect.

## ElastiCache Serverless (2023 GA)

Traditional ElastiCache chooses node class (`cache.r7g.large` etc.). Serverless delegates capacity to AWS, **charging by ECPU (read/write units) + stored GB**. Favors unpredictable or bursty traffic. Downside: higher per-unit cost vs reserved nodes, uneconomical for stable workloads.

| Dimension | ElastiCache (Provisioned) | ElastiCache Serverless |
|------|---------------------------|------------------------|
| Capacity decided | Manual (node class) | Automatic |
| Billing | Per-node hour | ECPU + GB-hour |
| Min cost | Per-node hour | Very low |
| Max scale | Manual scale-up/out | Automatic |
| Scenario | Predictable workload | Highly variable workload |

## MemoryDB vs ElastiCache Redis: Cache vs Primary DB

MemoryDB (2021) is **Redis-compatible in-memory DB**. Same Redis API as ElastiCache but different internals — all writes **multi-AZ transaction log** (DynamoDB-based) synchronously replicated before ack. RPO≈0 durability with ms-latency like RDS Multi-AZ.

| Item | ElastiCache Redis | MemoryDB |
|------|-------------------|----------|
| Durability | Optional (RDB/AOF/replica) | Standard (multi-AZ tx log) |
| Consistency | Replica eventually consistent | Strongly consistent |
| Write latency | Hundreds μs | Milliseconds (tx log sync) |
| Read latency | μs | μs (primary), < ms (replica) |
| Price | Baseline | ElastiCache 2-3x |
| Fitting use | Cache, session | Microservice primary DB |

> 💡 **Practical Pattern**: New microservice where "single-entity read/modify primary + ms response needed + DB-grade durability" sometimes suits MemoryDB over RDS. Pricier but simplifies DB Proxy/replica/backup ops. Exams rarely cover, but "microsecond latency + durable" combo → MemoryDB.

## Wrapping Up

ElastiCache appears simple but layers **engine choice (Redis vs Memcached) → topology choice (Cluster On/Off) → caching strategy (Lazy/Write-Through/...) → invalidation mechanism** — four decision layers accumulate. Each layer's choice differently tugs consistency, performance, cost, so exam always asks "given requirements, which combination is optimal."

Two most-tested decisions: **① Need persistence/Multi-AZ/complex structures → Redis.** **② Stale cache risk exists → Lazy alone insufficient — combine short TTL + event-based invalidation or write-through.** These two principles solo solve 80% of scenarios.

Next article covers Aurora — RDS compatibility but storage/replication layer redesigned cloud-native.

---

## 📝 연습 문제

**문제 1.** Game company needs global real-time leaderboard: 100M scores instantly sorted, specific user rank queried < 10ms. Most fitting tool?

A) ElastiCache Memcached + client-side sort
B) ElastiCache Redis Sorted Set (ZADD/ZREVRANK)
C) DynamoDB GSI
D) Aurora MySQL + ORDER BY

**정답: B**

해설: Redis Sorted Set designed exactly for this. ZADD O(log N), ZREVRANK/ZRANGE O(log N) — 100M data handled in ~27 comparisons. Internally maintains skip list + hash table, fast both for sort and key lookup. A: Memcached no structures, client loading/sorting impractical. C: DynamoDB GSI N+1 queries, throughput cost. D: Aurora ORDER BY on 100M rows takes minutes.

---

**문제 2.** Biggest Lazy Loading caching strategy downside?

A) All data cached, memory shortage
B) Cold miss slow first request, stale data after DB update
C) Complex implementation
D) Non-functional on Multi-AZ

**정답: B**

해설: Lazy Loading: ① cold miss slow first request ② cache outside DB updates unknown, returns stale. A reversed — Lazy only caches queried data, memory efficient. C reversed — simplest implementation. D irrelevant. Solution: short TTL + event-based invalidation + write-through combination.

---

**문제 3.** ALB-backed multi-EC2 app with session sharing issue. Best fix?

A) Enable ALB sticky session
B) Store sessions in ElastiCache Redis
C) Local file system session per EC2
D) S3 session JSON file

**정답: B**

해설: B solves sticky session problems (instance down loses session, load unbalanced). ElastiCache Redis: ms response + Multi-AZ failover + TTL auto-expire. A: short-term only, single instance fail loses all bound sessions. C: other instances can't see (original problem). D: S3 latency 100s ms, cost per call, unsuitable.

---

**문제 4.** ElastiCache Redis Cluster Mode Enabled: `MGET user:1 user:2 user:3` errors "CROSSSLOT Keys in request don't hash to the same slot." Best fix?

A) Disable Cluster Mode
B) Hash tag — rekey to `user:{1}`, `user:{2}` style, same tag per group
C) MGET → N GET calls
D) Switch Memcached

**정답: B (A is real alternative)**

해설: Multi-key commands need same slot. Hash tag: only `{...}` section hashed, forcing same slot. Example: `cart:{user123}:item1`, `cart:{user123}:item2` both hash on `user123` → same slot. A: Cluster disable sacrifices scale. C: works but round-trip cost, performance drop — pipelining mitigates. D: overkill.

---

**문제 5.** ElastiCache Redis node restart leaves cache empty, DB overwhelmed (thundering herd). Least helpful?

A) Multi-AZ enable (replica failover, cache stays)
B) AOF persistence enable (restore on restart)
C) Application single-flight pattern (one DB call per key max)
D) Switch Memcached

**정답: D**

해설: D worsens — Memcached no persistence, no Multi-AZ. Restart fully wipes cache, herd worse. A: Multi-AZ + primary down → replica immediate failover, cache preserved. B: AOF restore capable (ElastiCache limits — Multi-AZ replica preferred). C: app-level defense effective. Exam: "AWS service pick" questions reward knowing what each solves/doesn't.

---

**문제 6.** Redis vs Memcached difference, untrue statement?

A) Redis has persistence, Memcached none
B) Redis offers data structures (List, Hash, Set, Sorted Set), Memcached none
C) Memcached multithreaded, Redis single-threaded event loop
D) Memcached supports Multi-AZ auto-failover

**정답: D**

해설: Memcached no Multi-AZ failover. Cluster possible but no auto-failover — client rehashes on node fail. A/B/C all true. ElastiCache exams almost always: "Multi-AZ/persistence/complex structures needed → Redis."

---

**문제 7.** 1 hour TTL Lazy Loading cache: product price changed but 1 hour shows old price. Best fix?

A) Drop TTL from 1h to 5min, hot products shorter
B) Add Write-Through (update cache on product change)
C) Abandon cache, Aurora Read Replica direct
D) Switch Memcached for faster invalidation

**정답: B (A partial)**

해설: Core problem: DB updates cache unknown. Write-Through at update API → simultaneously DB + cache, eliminating stale window. A: shortens stale window but incomplete + hit ratio drops. C: cache benefit lost. D: same pattern, unresolved. Production standard: Write-Through + TTL (insurance) together. Robust: CDC/DynamoDB Streams event-based invalidation.
