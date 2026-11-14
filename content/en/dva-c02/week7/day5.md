# Day 5 - Week 7 Wrap-Up: Everything About Data-Tier Decisions

This week we went through the 3 major axes of AWS's data tier: **RDS, ElastiCache, and Aurora**. We saw that each solves a different problem and has different trade-offs. RDS is the first-generation managed DB that delegates the operational burden of relational databases to AWS; Aurora is the second generation, one step above, that redesigned the storage and replication layers to be cloud-native; and ElastiCache is the complement that provides an in-memory cache tier on top of both.

Data-domain questions on the DVA-C02 exam follow a fixed mold. They ask in scenario form, "given these requirements (availability, latency, cost, scalability, consistency), which service do you configure and how?" Today we regroup this week's content around scenarios and do a comprehensive check with 12 practical scenario questions.

## Decision Framework: 5 Steps for Choosing a Data Tier

The thought flow you go through when deciding on a data tier in production is the following 5 steps. It applies directly to analyzing exam scenarios too.

```
Step 1: Data model
  └─ Relational (needs JOINs, transactions)      → RDS / Aurora
  └─ Key-value (mostly single-entity lookups)    → DynamoDB / ElastiCache
  └─ Document, time-series, graph, etc.          → DocumentDB / Timestream / Neptune

Step 2: Consistency requirement
  └─ Strong consistency (ACID needed)            → RDS / Aurora / MemoryDB
  └─ Eventual consistency acceptable             → DynamoDB / ElastiCache Replica

Step 3: Latency requirement
  └─ μs (microseconds)                           → ElastiCache / MemoryDB / DAX
  └─ ms (single-digit milliseconds)              → Aurora primary / DynamoDB
  └─ A few ms to tens of ms                      → RDS / Aurora Replica / S3

Step 4: Availability and DR requirement
  └─ Single AZ OK                                → Basic RDS Single-AZ
  └─ Automatic AZ failure recovery (RTO in minutes) → RDS Multi-AZ
  └─ Cross-region DR (RTO in minutes)            → Aurora Global / DynamoDB Global Tables

Step 5: Cost model
  └─ Steady traffic                              → Reserved Instance (~50-70% savings)
  └─ Variable traffic                            → Aurora Serverless v2 / DynamoDB On-Demand
  └─ Dev/staging                                 → Single-AZ + Reserved (or Serverless auto-pause)
```

## RDS, ElastiCache, Aurora Compared: The Same Question, Different Answers

### The Three Services' Answers to "High Availability"

| Service | Mechanism | Failover time | RPO |
|--------|---------|--------------|-----|
| RDS Multi-AZ Instance | Block-level synchronous replication (1 standby) | 60-120 seconds | ~0 |
| RDS Multi-AZ Cluster | Synchronous quorum (2 readable standbys) | 35 seconds or less | ~0 |
| ElastiCache Redis Multi-AZ | Primary-Replica + sentinel | 60 seconds or less | replica lag |
| Aurora Multi-AZ | 6-copy quorum | Typically under 60 seconds (often under 30) | ~0 |
| Aurora Global Database | Redo log shipping (cross-region) | On the order of minutes (managed failover) | Under 1 second |

### The Three Services' Answers to "Read Scaling"

| Service | Mechanism | Max count | Replication lag |
|--------|---------|-----------|----------|
| RDS Read Replica | binlog/WAL asynchronous | 15 (MySQL/PG/MariaDB) | Seconds to minutes |
| ElastiCache Redis Replica | Redis replication | 5 per shard | ms |
| Aurora Replica | Redo log notification (shared storage) | 15 | Usually much less than 100 ms |

### Answers for "Password/Key Management"

| Tool | What it protects | Rotation | RDS compatible |
|------|-----------|------|----------|
| AWS KMS | Data encryption keys | Automatic (1 year) | ✅ at-rest |
| Secrets Manager | Passwords, API keys | Automatic (Lambda or native) | ✅ |
| IAM DB Authentication | Removes the password itself | N/A (15-minute token) | ✅ MySQL/PG |
| Parameter Store | General config values (SecureString also possible) | Manual | △ (possible but no rotation) |

## 15 Exam Pitfalls Summarized

A collection of easy-to-confuse traps.

1. **A Multi-AZ Standby can't be read from**: though Multi-AZ Cluster Deployment (2022~) provides 2 readable standbys
2. **Encryption conversion = snapshot → KMS copy → restore**: direct modify is not possible
3. **Setting automatic backups to 0 days blocks both PITR and Read Replica creation**
4. **IAM DB Auth token = 15-minute SigV4, SSL required**
5. **When a DB is deleted, automatic backups are deleted with it (Final Snapshot option is essential)**, while manual snapshots are retained
6. **Reading right after a write on a Read Replica = stale data** (a Read-Your-Writes violation is possible)
7. **Aurora Replica automatic failover typically < 60 seconds (often < 30)**, RDS Multi-AZ is 60-120 seconds
8. **Aurora storage = 3 AZ × 2 copies = 6, W=4 R=3**
9. **Aurora Serverless v1 is minute-granular + cold start**, v2 is fine-grained + non-disruptive scaling (about 15 s to resume from auto-pause)
10. **Redis Cluster Mode Disabled is a single shard**: one node's memory is the limit
11. **Memcached has no persistence, backup, Multi-AZ, or replication**
12. **Redis Sorted Set = the leaderboard answer (ZADD/ZREVRANK O(log N))**
13. **DAX is DynamoDB-only**, ElastiCache is general-purpose (they can't substitute for each other)
14. **RDS Proxy = the number-one fix for Lambda + RDS connection storms**
15. **Aurora Backtrack = MySQL only, 72 hours in-place** (a different mechanism from PITR)

> ⚠️ **Pitfall example 1 - automatic backup retention of 0 days**: If you set the retention period to 0 days with the intent of "turning off" automatic backups, PITR becomes impossible at that moment and Read Replica creation is also blocked. Exam question: "What is the cause of a failed Read Replica creation attempt?" → automatic backups are disabled. Fix: set the retention period to 1 day or more.

> ⚠️ **Pitfall example 2 - maximum Aurora vs RDS Read Replica count**: An Aurora cluster allows up to 15 Aurora Replicas, and RDS also allows up to 15 per source for MySQL/PostgreSQL/MariaDB/SQL Server. Oracle follows its own engine documentation. When a simple question like "maximum number of RDS Read Replicas" appears on the exam, you must answer by looking at the engine.

## Practical Patterns: Scenario Mapping

| Scenario keywords | Answer |
|----------------|-----|
| "Lambda + RDS + connection spike" | RDS Proxy |
| "Automatic password rotation + zero downtime" | Secrets Manager rotation |
| "Remove the password itself from code" | IAM DB Authentication |
| "Instantly recover from DROP TABLE (Aurora MySQL)" | Backtrack |
| "Recover yesterday's data after DROP TABLE" | PITR |
| "Keep backups even after the DB is deleted" | Manual snapshot / Final Snapshot |
| "Query wait event analysis" | Performance Insights |
| "OS process-level monitoring" | Enhanced Monitoring |
| "Leaderboard/ranking caching" | Redis Sorted Set |
| "Share sessions across multiple EC2 instances" | ElastiCache Redis |
| "DynamoDB cache" | DAX |
| "Global RDBMS + under 1 second lag" | Aurora Global Database |
| "Global NoSQL + multi-master" | DynamoDB Global Tables |
| "Intermittent RDB traffic + auto scaling" | Aurora Serverless v2 |
| "Store PII + 1-year audit log" | Audit log → CloudWatch Logs + KMS |
| "Ransomware-resistant backup" | AWS Backup Vault Lock (WORM) |
| "Multi-AZ but want to read from the standby" | Multi-AZ Cluster Deployment |
| "Aurora replica load concentrates on only one node" | DNS TTL/connection persistence issue, RDS Proxy or cluster-aware client |
| "Connection failure due to CA certificate expiry" | RDS CA rotation, refresh the trust store |
| "Microsecond latency + DB-level durability" | MemoryDB for Redis |

## Cross-Service Patterns Worth Knowing

### Pattern 1: "High-Performance OLTP + Analytics Isolation + DR"

```
Production Seoul:
  Aurora MySQL Multi-AZ
    ├── Writer endpoint → OLTP traffic
    ├── Reader endpoint → general reads
    └── Custom endpoint (2 large instances) → isolate analytics workloads

DR Tokyo:
  Aurora Global Database secondary
    └── Read-only, minimizes in-region latency
    └── Promote when the primary region goes down (RTO on the order of minutes)

Cache tier:
  ElastiCache Redis Cluster Mode Enabled (Seoul)
    ├── Session data
    ├── Popular product info (Lazy Loading + 5-minute TTL)
    └── Leaderboard (Sorted Set)

Secrets management:
  Secrets Manager + RDS Proxy (on the Lambda function side)
  KMS CMK encrypts storage/snapshots/Secrets all together
```

This one configuration contains most of this week's concepts.

### Pattern 2: "Evolving from Startup MVP to Production"

```
Phase 1 (MVP):
  RDS MySQL Single-AZ db.t3.micro + local in-memory cache (library)

Phase 2 (traffic growth):
  RDS MySQL Multi-AZ db.t3.medium + ElastiCache Redis (sessions, popular data)

Phase 3 (scale-out):
  Aurora MySQL Multi-AZ + 3 Aurora Replicas + ElastiCache Redis Cluster
  Introduce RDS Proxy (as Lambda functions multiply)

Phase 4 (global):
  Aurora Global Database (Seoul + Tokyo)
  CloudFront + S3 static asset CDN
  ElastiCache Replica in each region
```

### Pattern 3: "Hardened Compliance Environment"

```
- RDS at-rest encryption (KMS CMK, company-owned key)
- Enforce TLS (rds.force_ssl=1)
- IAM DB Auth + Secrets Manager (human users use IAM, applications use Secrets Manager + RDS Proxy)
- Audit log → CloudWatch Logs (KMS-encrypted) → 1-year retention → S3 archive
- Protect backups with WORM using AWS Backup Vault Lock
- VPC private subnet only, no NAT Gateway (egress blocked)
- Enable CloudTrail data events
```

This is an example configuration used in environments seeking certifications such as HIPAA, PCI-DSS, and ISO 27001.

## Cost View: The Break-Even of Reserved Instances and Serverless

| Option | Commitment term | Cost savings |
|------|---------|----------|
| On-Demand | None | 0% (baseline) |
| 1-year Standard RI No Upfront | 1 year | About 30% |
| 1-year Standard RI All Upfront | 1 year | About 38% |
| 3-year Standard RI All Upfront | 3 years | About 60% |
| Aurora Serverless v2 (steady traffic) | None | -20% (actually more expensive) |
| Aurora Serverless v2 (intermittent traffic) | None | 50-80% (0 ACU when unused) |

In "cost optimization" scenarios, if the traffic pattern is steady the answer is Reserved Instance, and if it is variable the answer is Serverless. The criterion for variable is roughly "usage differs 5x or more by time of day," and below that the RI is advantageous.

## CLI/SDK Quick Reference

```bash
# Create RDS (Multi-AZ + encryption + IAM authentication)
aws rds create-db-instance \
  --db-instance-identifier prod-mysql \
  --db-instance-class db.r6g.large \
  --engine mysql --master-username admin \
  --master-user-password "$(aws secretsmanager get-random-password --output text --query RandomPassword)" \
  --allocated-storage 100 --storage-type gp3 \
  --multi-az --storage-encrypted \
  --enable-iam-database-authentication \
  --backup-retention-period 14 \
  --enable-cloudwatch-logs-exports '["audit","error","general","slowquery"]'

# Create Aurora Cluster (prepare for Global Database)
aws rds create-global-cluster --global-cluster-identifier my-global \
  --engine aurora-mysql
aws rds create-db-cluster --db-cluster-identifier my-primary \
  --engine aurora-mysql --global-cluster-identifier my-global \
  --master-username admin --master-user-password ... 
aws rds create-db-instance --db-instance-identifier my-primary-instance \
  --db-cluster-identifier my-primary --db-instance-class db.r6g.large \
  --engine aurora-mysql

# Add to the secondary region
aws rds create-db-cluster --region us-east-1 \
  --db-cluster-identifier my-secondary \
  --engine aurora-mysql --global-cluster-identifier my-global

# ElastiCache Redis Cluster Mode Enabled
aws elasticache create-replication-group \
  --replication-group-id prod-cache \
  --replication-group-description "production cache" \
  --engine redis --cache-node-type cache.r7g.large \
  --num-node-groups 3 --replicas-per-node-group 2 \
  --automatic-failover-enabled --multi-az-enabled \
  --at-rest-encryption-enabled --transit-encryption-enabled \
  --auth-token "$(aws secretsmanager get-random-password ...)"

# Create RDS Proxy
aws rds create-db-proxy \
  --db-proxy-name my-proxy \
  --engine-family MYSQL \
  --auth '[{"AuthScheme":"SECRETS","SecretArn":"arn:aws:secretsmanager:..."}]' \
  --role-arn arn:aws:iam::123456789012:role/rdsproxyrole \
  --vpc-subnet-ids subnet-aaa subnet-bbb \
  --require-tls
```

## Wrapping Up

This week's content compresses into two points.

- **Fundamental distributed-systems trade-offs such as "relational vs key-value," "strong vs eventual consistency," and "synchronous vs asynchronous replication" are projected directly onto the choice of AWS data services.**
- **For the same problem (availability, scalability, latency), RDS/Aurora/ElastiCache each have a different answer, and the exam asks for "the most appropriate one under the given constraints" among those answers.**

Next week we move on to NoSQL: DynamoDB. DynamoDB is a service with an almost opposite philosophy from RDS (automatic sharding, a strong consistency option, unlimited scaling, giving up the relational model). If you understand RDS/Aurora this week, "why was DynamoDB designed so differently" becomes much easier to see.

---

## 📝 Week 7 Integrated Practical Scenarios: 12 Questions

**Question 1.** A SaaS company runs production RDS MySQL. 500 Lambda functions are invoked concurrently during burst traffic, producing "Too many connections" errors, and the security team also demands all three: "no passwords in code + automatic rotation + connection stability." What is the most appropriate configuration?

A) Store the password in Lambda environment variables with KMS encryption + limit concurrency with reserved concurrency of 50 + mitigate cold starts with provisioned concurrency
B) Use RDS IAM Authentication alone, with Lambda generating a SigV4 token on every invocation and connecting directly
C) RDS Proxy + Secrets Manager automatic rotation + Lambda connecting to the Proxy with IAM authentication
D) Fully migrate to DynamoDB and add a DAX cache tier to eliminate the very concept of connections

**Answer: C**

Explanation: To satisfy all three requirements, (1) RDS Proxy for connection pool stability, (2) Secrets Manager for automatic rotation, and (3) IAM (or the Secrets ARN) for Lambda → RDS Proxy authentication must all work together. RDS Proxy automatically recognizes secret updates from Secrets Manager and refreshes backend connections, so zero-downtime rotation is possible. A) Limiting concurrency costs throughput. B) IAM alone doesn't solve the connection storm (15-minute token + 200/second limit). D) Changing the data model is excessive.

---

**Question 2.** A fintech company wants a non-Aurora RDS configuration that satisfies all of the following: (1) RPO ≈ 0, (2) analytics queries can run on the standby, (3) failover time < 60 seconds. Which option fits best?

A) RDS Multi-AZ DB Instance Deployment (1 synchronous standby) + 2 separate Read Replicas for analytics queries
B) RDS Multi-AZ DB Cluster Deployment (new in 2022)
C) Aurora MySQL Multi-AZ
D) RDS Single-AZ + 7-day automatic backup retention + restoring daily snapshots for analytics

**Answer: B**

Explanation: Multi-AZ DB Cluster Deployment (MySQL/PostgreSQL only, new in 2022) has a 1 writer + 2 readable standby structure + synchronous quorum replication, simultaneously satisfying (1) RPO≈0, (2) reads from the standby, and (3) failover within 35 seconds. A) The standby in a regular Multi-AZ Instance can't be read from; Read Replicas are separate. C) Aurora Multi-AZ meets the requirements themselves but violates the stated condition (non-Aurora RDS), so Cluster Deployment is the answer. D) Single-AZ fails both (1) and (3).

---

**Question 3.** In ElastiCache Redis Cluster Mode Enabled, traffic concentrates on one hot key (a popular product ID), so one shard's CPU is at 100% while the other shards are at 5%. What is the most effective fix?

A) Switch Cluster Mode to Disabled and spread reads with a single shard + 5 Read Replicas
B) Use hash tags to spread that key across multiple slots (key sharding)
C) Raise the instance class one step from cache.r7g.large to secure CPU/memory headroom on the hot shard
D) Add more Read Replicas

**Answer: B (or D)**

Explanation: The essence of B is the pattern of "spreading one key across several sub-keys" (for example, `product:123:shard{0}` to `product:123:shard{9}`) so they scatter across different slots/shards. The client reads from a random shard, and writes are broadcast to all shards. D) Read Replicas are effective for spreading reads but only within the same shard, so the effect is limited if writes concentrate on the hot key. A) Disabling Cluster Mode loses scalability. C) A short-term patch that doesn't solve the essence of the hot key.

---

**Question 4.** A company uses Aurora MySQL, and a developer accidentally ran `DELETE FROM orders WHERE created_at > '2024-01-01'` on the production DB. What is the fastest recovery method? (within 30 minutes of the incident)

A) Create a new cluster at a point 5 minutes earlier with PITR, then export/import only the deleted rows with mysqldump
B) Recover in place to just before the incident with Backtrack
C) Manually trigger a Multi-AZ failover to switch to the instance in another AZ and restart
D) Restore from the latest automatic snapshot to a separate cluster and swap the endpoint

**Answer: B**

Explanation: Backtrack is Aurora MySQL's in-place time-rewind feature: up to 72 hours back, it restores the cluster itself to a past point without creating a new instance. It completes in seconds to minutes. A) PITR needs new instance creation (30 minutes) + an endpoint switch procedure, so it is much slower. C) Failover has nothing to do with data recovery. D) Snapshot restore is slow, in minutes to hours, and needs a new instance endpoint switch. On the exam, "Aurora MySQL + fast recovery from a mistake" is an immediate Backtrack.

---

**Question 5.** A game company runs a real-time leaderboard for global users. It must satisfy all of: (1) sorting 100 million users' scores, (2) a specific user's rank lookup < 10ms, (3) 100,000 score updates per second. What configuration fits best?

A) In DynamoDB, put the score as a GSI partition key and sort with Query + ScanIndexForward, accelerating reads with DAX
B) A B-tree index on a score column in RDS MySQL + ORDER BY score DESC LIMIT + spreading with Read Replicas
C) ElastiCache Redis Sorted Set
D) Load score events into S3 and use Athena ORDER BY queries + a QuickSight dashboard

**Answer: C**

Explanation: The Redis Sorted Set is a data structure that exists for exactly this use case. ZADD O(log N), ZREVRANK O(log N), ZRANGE O(log N + M): even with 100 million entries it needs about 27 comparisons. Single-node throughput is 100K+ commands per second. A) DynamoDB GSIs have difficulty computing exact ranks and a high throughput cost. B) Aurora ORDER BY on 100 million rows takes minutes. D) S3+Athena is for batch analytics. On the exam, the keywords "leaderboard/ranking/real-time score" are almost always Redis Sorted Set.

---

**Question 6.** A healthcare SaaS stores PHI (Protected Health Information) in RDS PostgreSQL. HIPAA audit requirements are: (1) encrypt stored data with a company KMS key, (2) enforce TLS, (3) retain "who ran which query" for 1 year, (4) WORM protection for backups. Which one is missing? Select all of the following items that should be applied:

(A) Enable the `pgaudit` extension + CloudWatch Logs export  
(B) `rds.force_ssl=1` parameter  
(C) Encrypt the instance with a KMS CMK (customer managed key)  
(D) Enable AWS Backup Vault Lock

A) A and C only
B) B and D only
C) All of A, B, C, and D
D) C and D only

**Answer: C (all of A, B, C, and D)**

Explanation: These exact 4 items are the standard checklist for a HIPAA-grade RDS configuration. (A) Enable the audit log with pgaudit/the MariaDB audit plugin, then export to CloudWatch Logs → a 1-year retention policy. (B) Enforcing TLS blocks plaintext traffic. (C) A KMS CMK lets the company manage and rotate the key directly. (D) Vault Lock (WORM) protects backups from ransomware and insider threats. If even one is missing, the audit raises a finding.

---

**Question 7.** An e-commerce company implemented product info caching in ElastiCache Redis in front of Aurora MySQL, using Lazy Loading + a 1-hour TTL. The operations team reports, "even after we change a product price, the old price shows for 1 hour." What is the most appropriate fix?

A) Shorten the TTL from 1 hour to 5 minutes and apply a differentiated, shorter TTL only to popular products
B) Add the Write-Through pattern (update the cache at the same time when a product is updated)
C) Remove Lazy Loading and send all lookups directly to an Aurora Read Replica to avoid the cache consistency problem
D) Switch to Memcached to take advantage of faster cache invalidation and multi-threaded processing

**Answer: B (or A as a supplement)**

Explanation: The essential problem is "the cache doesn't know when the DB is updated." Updating both the DB and the cache in the update API with Write-Through eliminates the stale window. A) Shortening the TTL reduces the stale window but doesn't fully solve it + lowers the cache hit ratio. C) Gives up the cache benefit itself. D) It is the same pattern, so it doesn't solve it. The practical standard pattern: use Write-Through + TTL (as insurance) together. A more robust approach is event-based invalidation such as CDC (Debezium, etc.) or DynamoDB Streams.

---

**Question 8.** A company runs Aurora MySQL in Tokyo. As global users grow, read latency must be 50ms or less in the US and Europe too, and it must be possible to promote to another region automatically if the Tokyo region goes down. What is the appropriate configuration?

A) Place one Aurora Cross-Region Read Replica each in the US and Europe and synchronize with binlog asynchronous replication
B) Aurora Global Database (Primary: Tokyo, Secondary: Virginia, Ireland)
C) Configure multi-region multi-master with DynamoDB Global Tables and rewrite the application to a key-value model
D) Extend Aurora Multi-AZ to 3 AZs and connect global users to Tokyo with Route 53 latency routing

**Answer: B**

Explanation: Aurora Global Database provides (1) cross-region lag typically < 1 second on dedicated infrastructure, (2) managed failover RTO on the order of minutes, and (3) its own read replicas in each secondary region, minimizing in-region latency. A) A Cross-Region Read Replica is also possible but is weaker on lag and failover automation. C) Loses RDBMS compatibility (migrating MySQL → NoSQL is excessive). D) Multi-AZ gives availability only within the same region and can't go cross-region. Note that the word "automatic" failover is a trap: Aurora Global is also managed failover, not automatic (the operator triggers it).

---

**Question 9.** A startup wants to cut RDS cost for its dev/staging environment. It is used only 9:00-18:00 on weekdays and not at all on weekends and nights. What is the most cost-effective configuration?

A) RDS Single-AZ db.t3.micro + a 1-year All Upfront Reserved Instance for about 38% savings, keeping the instance running at night but lowering storage to gp3 to cut cost
B) RDS Multi-AZ db.t3.medium + Storage Auto Scaling that shrinks automatically to match nighttime load and a read replica to isolate analytics queries
C) Aurora Serverless v2 (Min 0 ACU - auto-pause)
D) RDS Single-AZ automation with an EventBridge schedule that stops the instance at 18:00 and starts it at 9:00 on weekdays, accepting that storage/backup are still billed while stopped

**Answer: C**

Explanation: Aurora Serverless v2 automatically scales down to 0 ACU when there is no traffic (auto-pause), so night/weekend cost is nearly 0. It scales up in seconds when used. This is the typical usage pattern of dev/staging. A) Single-AZ + RI bills 24 hours, so night cost occurs. B) Multi-AZ doubles the cost. D) RDS doesn't support Spot (EC2 only). On the exam, "intermittent, unpredictable, dev environment" is an immediate Aurora Serverless v2.

---

**Question 10.** A company runs Multi-AZ RDS MySQL. An automatic minor patch ran and caused 4 minutes of downtime at the weekday morning traffic peak. Which of the following is NOT an appropriate way to prevent the same incident in the future?

A) Explicitly set `preferred-maintenance-window` to the lowest-traffic time such as Sunday 03:00-04:00 UTC
B) Change `auto-minor-version-upgrade` to false, validate in staging, and manage a manual patch schedule
C) Introduce RDS Proxy to secure connection stability
D) Switch to Multi-AZ Cluster Deployment (synchronous quorum replication + failover within 35 seconds)

**Answer: C**

Explanation: RDS Proxy provides connection pooling but doesn't solve the downtime of the instance patching itself: if the backend RDS goes down, the Proxy is affected too. A), B), and D) are all effective: A adjusts the window so patching happens at low-traffic time, B controls the schedule through manual management, and D minimizes downtime with synchronous quorum replication + fast failover. On the exam, the answers for "minimize patch downtime" are (1) Multi-AZ, (2) setting the maintenance window, and (3) Cluster Deployment (faster failover).

---

**Question 11.** A company uses ElastiCache Redis, and when one node suddenly went down the whole cache emptied, traffic to RDS surged at that moment, and it suffered a cascading failure that took down RDS too. What is the most appropriate configuration to prevent the same incident in the future?

A) Change Redis to a Memcached multi-node setup and remove the single point of failure by distributing nodes
B) Multi-AZ Redis replication + application-side single-flight + RDS Proxy + the circuit breaker pattern
C) Raise the RDS instance class two steps and increase max_connections to absorb the surge traffic
D) Send all read requests only to ElastiCache and change it to return an empty response on a cache miss

**Answer: B**

Explanation: Defending against a thundering herd / cascading failure takes (1) availability of the cache itself (Multi-AZ replication), (2) limiting concurrent DB calls for the same key (single-flight), (3) DB connection stability (RDS Proxy), and (4) blocking failure propagation (circuit breaker): layered defense is the standard. A) Memcached has no persistence/Multi-AZ, so it makes things worse. C) Only increases cost and doesn't fix the root. D) A cache miss needs the DB, so it is impossible.

---

**Question 12.** In which of the following scenarios is **DAX (DynamoDB Accelerator) NOT the answer**?

A) Cutting DynamoDB read latency from single-digit ms to microseconds (in-memory write-through cache)
B) Reducing DynamoDB read cost (fewer RCUs consumed through cache hits + absorbing repeated lookup load)
C) Using it as a general-purpose cache like ElastiCache Redis
D) Improving the repeated response time of DynamoDB Eventually Consistent Reads by returning immediately from the cache

**Answer: C**

Explanation: DAX is a DynamoDB-only cache (in-memory write-through). It can't be used as a general data cache like ElastiCache; it only provides DynamoDB API compatibility. A), B), and D) are all exact DAX use cases. A) Microsecond responses. B) On a cache hit, DynamoDB RCUs aren't consumed. D) For Eventually Consistent reads too, DAX responds immediately from the cache. On the exam, "DynamoDB cache" is DAX and "general cache" is ElastiCache, clearly distinguished.
