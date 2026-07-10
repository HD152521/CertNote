# Day 5 - Week 7 Comprehensive: Everything About Data Layer Decision-Making

This week traversed AWS data layer's three pillars — **RDS, ElastiCache, Aurora** — each solving different problems with different trade-offs. RDS is 1st-gen managed DB outsourcing RDBMS operations to AWS. Aurora is 2nd-gen, redesigning storage/replication layers cloud-native. ElastiCache is in-memory cache layer complementing both.

DVA-C02 data area questions follow set patterns — "given these requirements (availability, latency, cost, scale, consistency), which service/config answers it." Today we reframe this week through scenarios, then comprehensive 12-question exam.

## Decision Framework: Data Layer Selection 5 Steps

Real production data layer choice follows 5-step thinking. Exam scenario analysis uses same flow.

```
Step 1: Data Model
  └─ Relational (JOIN, transactions needed)        → RDS / Aurora
  └─ Key-value (single entity reads mostly)        → DynamoDB / ElastiCache
  └─ Document/TimeSeries/Graph etc.               → DocumentDB / Timestream / Neptune

Step 2: Consistency Requirement
  └─ Strong consistency (ACID needed)              → RDS / Aurora / MemoryDB
  └─ Eventual consistency acceptable              → DynamoDB / ElastiCache Replica

Step 3: Latency Requirement
  └─ μs (microseconds)                             → ElastiCache / MemoryDB / DAX
  └─ ms (single digit)                             → Aurora primary / DynamoDB
  └─ Tens ms                                        → RDS / Aurora Replica / S3

Step 4: Availability/DR Requirement
  └─ Single AZ OK                                  → Basic RDS Single-AZ
  └─ AZ failure auto-recovery (RTO minute scale)   → RDS Multi-AZ
  └─ Cross-region DR (RTO minute scale)            → Aurora Global / DynamoDB Global Tables

Step 5: Cost Model
  └─ Stable traffic                                → Reserved Instance (~50-70% off)
  └─ Variable traffic                              → Aurora Serverless v2 / DynamoDB On-Demand
  └─ Dev/staging                                   → Single-AZ + Reserved (or Serverless auto-pause)
```

> 💡 **Related Theory**: This flow is **CAP/PACELC theorem application**. Brewer's CAP (2000): "partition happens, choose Consistency OR Availability." Abadi's PACELC (2012): "else (no partition), still tradeoff Consistency vs Latency." RDS Multi-AZ is PC/EC (partition → consistency, else → consistency). DynamoDB Global Tables is PA/EL (partition → availability, else → latency). Aurora is quorum-based PC/EC single-region, Global Database hybrid.

## RDS·ElastiCache·Aurora Comparison: Same Q, Different A

### High Availability Answers

| Service | Mechanism | Failover Time | RPO |
|--------|---------|--------------|-----|
| RDS Multi-AZ Instance | Block sync replication (1 standby) | 60-120 sec | ~0 |
| RDS Multi-AZ Cluster | Sync quorum (2 readable standby) | ≤ 35 sec | ~0 |
| ElastiCache Redis Multi-AZ | Primary-Replica + sentinel | ≤ 60 sec | Replica lag |
| Aurora Multi-AZ | 6-copy quorum | ≤ 30 sec | ~0 |
| Aurora Global Database | Redo log shipping (cross-region) | ≤ 1 min (managed) | < 1 sec |

### Read Scaling Answers

| Service | Mechanism | Max Count | Replication Lag |
|--------|---------|-----------|----------|
| RDS Read Replica | Async binlog/WAL | 15 (MySQL/PG/MariaDB) | Seconds ~ minutes |
| ElastiCache Redis Replica | Redis replication | 5 per shard | ms |
| Aurora Replica | Redo log alert (shared storage) | 15 | 10-20ms |

### Password/Key Management Answers

| Tool | Protects | Rotation | RDS Compatible |
|------|-----------|------|----------|
| AWS KMS | Data encryption key | Auto (1 year) | ✅ at-rest |
| Secrets Manager | Password, API key | Auto (Lambda or native) | ✅ |
| IAM DB Authentication | Password itself removed | N/A (15-min token) | ✅ MySQL/PG |
| Parameter Store | General config (SecureString option) | Manual | △ (possible, no rotation) |

## 15 Exam Traps Summary

Most-tested patterns students miss:

1. **Multi-AZ Standby no reads** — Multi-AZ Cluster Deployment (2022+) has readable standbys 2
2. **Encryption switch = snapshot → KMS copy → restore** — direct modify impossible
3. **Auto-backup 0 days blocks PITR and Read Replica** creation
4. **IAM DB Auth token = 15-min SigV4, SSL mandatory**
5. **DB deletion erases auto-backup** (unless Final Snapshot made); manual snapshots stay
6. **Read Replica post-write read = stale data** (Read-Your-Writes violation possible)
7. **Aurora Replica auto-failover < 30 sec**, RDS Multi-AZ 60-120 sec
8. **Aurora storage = 3 AZ × 2 copies = 6, W=4 R=3**
9. **Aurora Serverless v1 minute-level + cold start**, v2 second-level + barely any
10. **Redis Cluster Mode Disabled = single shard** — one node memory is limit
11. **Memcached: persistence/backup/Multi-AZ/replication all absent**
12. **Redis Sorted Set = leaderboard answer** (ZADD/ZREVRANK O(log N))
13. **DAX = DynamoDB-only**, ElastiCache = general-purpose (not interchangeable)
14. **RDS Proxy = Lambda + RDS connection storm first-line fix**
15. **Aurora Backtrack = MySQL only, 72h in-place** (different from PITR mechanism)

> ⚠️ **Trap Example 1 — Auto-Backup Retention 0 Days**: Setting 0 to "disable" auto-backup simultaneously blocks PITR and Read Replica creation. Exam: "Read Replica creation fails, most common cause?" → auto-backup disabled. Fix: set ≥ 1 day.

> ⚠️ **Trap Example 2 — RDS Read Replica Max Count Post-2022**: Pre-2022 was "Aurora 15, RDS 5." Post-2022, RDS MySQL/PostgreSQL/MariaDB raised to 15 (Oracle/SQL Server stay 5). Exam "RDS Read Replica max" requires engine check.

## Practical Patterns: Frequently-Tested Scenarios Map

| Scenario Keywords | Answer |
|----------------|-----|
| "Lambda + RDS + connection burst" | RDS Proxy |
| "Password auto-rotate + seamless" | Secrets Manager rotation |
| "Password itself removed from code" | IAM DB Authentication |
| "DROP TABLE instant recovery (Aurora MySQL)" | Backtrack |
| "DROP TABLE yesterday's data recovery" | PITR |
| "DB delete but backup survives" | Manual snapshot / Final Snapshot |
| "Query wait event analysis" | Performance Insights |
| "OS process-level monitoring" | Enhanced Monitoring |
| "Leaderboard/ranking cache" | Redis Sorted Set |
| "Multi-EC2 session sharing" | ElastiCache Redis |
| "DynamoDB cache" | DAX |
| "Global RDBMS + < 1 sec lag" | Aurora Global Database |
| "Global NoSQL + multi-master" | DynamoDB Global Tables |
| "Sporadic DB traffic + auto-scale" | Aurora Serverless v2 |
| "PII storage + 1-year audit log" | Audit log → CloudWatch Logs + KMS |
| "Ransomware-proof backup" | AWS Backup Vault Lock (WORM) |
| "Multi-AZ but read from standby" | Multi-AZ Cluster Deployment |
| "Aurora replica imbalanced load, one node swamped" | DNS TTL/connection hold issue, RDS Proxy or cluster-aware client |
| "CA cert expiry connection fail" | RDS CA rotation, trust store update |
| "Microsecond latency + DB durability" | MemoryDB for Redis |

## Cross-Service Patterns Worth Learning

### Pattern 1: "High-Performance OLTP + Analytics Isolation + DR"

```
Production Seoul:
  Aurora MySQL Multi-AZ
    ├── Writer endpoint → OLTP traffic
    ├── Reader endpoint → General reads
    └── Custom endpoint (large instances 2) → Analytics isolated

DR Tokyo:
  Aurora Global Database secondary
    └── Read-only, region-local latency min
    └── Primary down → promote (RTO < 1 min)

Cache Layer:
  ElastiCache Redis Cluster Mode (Seoul)
    ├── Session data
    ├── Hot products (Lazy Loading + 5-min TTL)
    └── Leaderboard (Sorted Set)

Secret Management:
  Secrets Manager + RDS Proxy (Lambda-side)
  KMS CMK for storage/snapshot/Secrets encryption
```

Nearly all this week's concepts in one architecture — end-game exam scenario.

### Pattern 2: "Startup MVP to Production Evolution"

```
Phase 1 (MVP):
  RDS MySQL Single-AZ db.t3.micro + in-process cache

Phase 2 (Traffic Growth):
  RDS MySQL Multi-AZ db.t3.medium + ElastiCache Redis (sessions, hot)

Phase 3 (Scale):
  Aurora MySQL Multi-AZ + Aurora Replica 3 + ElastiCache Cluster
  RDS Proxy added (more Lambda)

Phase 4 (Global):
  Aurora Global (Seoul + Tokyo)
  CloudFront + S3 CDN
  ElastiCache replica per region
```

> 📚 **Case Study**: Coupang ~2017-2020 followed similar path (public talks). MySQL → Aurora cut instance tier down same traffic, replicas 5→15 for analytics, ElastiCache for session/catalog. Pattern became Korean e-commerce standard stack.

### Pattern 3: "Compliance-Heavy Environment"

```
- RDS at-rest KMS encryption (company-owned CMK)
- TLS forced (rds.force_ssl=1)
- IAM DB Auth + Secrets Manager (humans: IAM; apps: Secrets + RDS Proxy)
- Audit log → CloudWatch Logs (KMS encrypted) → 1-year retention → S3 archive
- AWS Backup Vault Lock (WORM) for backup ransomware defense
- VPC private subnets only, NAT Gateway none (egress block)
- CloudTrail data events enabled
```

HIPAA/PCI-DSS/ISO 27001 certification standard config.

## Cost View: Reserved Instance vs Serverless Breakeven

| Option | Commitment | Savings |
|--------|-----------|----------|
| On-Demand | None | 0% (baseline) |
| 1-Year Standard RI No Upfront | 1 year | ~30% |
| 1-Year Standard RI All Upfront | 1 year | ~38% |
| 3-Year Standard RI All Upfront | 3 years | ~60% |
| Aurora Serverless v2 (Stable) | None | -20% (more expensive) |
| Aurora Serverless v2 (Bursty) | None | 50-80% (unused time = 0 ACU) |

> 💡 **Exam Tip**: "Cost optimization" scenarios — steady traffic → Reserved Instance, variable → Serverless. Variable threshold: usage differs 5x+ across timeframe; below that RI usually wins.

## CLI Quick Reference

```bash
# RDS create (Multi-AZ + encryption + IAM auth)
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

# Aurora Cluster (Global Database ready)
aws rds create-global-cluster --global-cluster-identifier my-global \
  --engine aurora-mysql
aws rds create-db-cluster --db-cluster-identifier my-primary \
  --engine aurora-mysql --global-cluster-identifier my-global \
  --master-username admin --master-user-password ... 
aws rds create-db-instance --db-instance-identifier my-primary-instance \
  --db-cluster-identifier my-primary --db-instance-class db.r6g.large \
  --engine aurora-mysql

# Add secondary region
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

# RDS Proxy
aws rds create-db-proxy \
  --db-proxy-name my-proxy \
  --engine-family MYSQL \
  --auth '[{"AuthScheme":"SECRETS","SecretArn":"arn:aws:secretsmanager:..."}]' \
  --role-arn arn:aws:iam::123456789012:role/rdsproxyrole \
  --vpc-subnet-ids subnet-aaa subnet-bbb \
  --require-tls
```

## Wrapping Up

Week 7's core compresses to two points: **First, "relational vs key-value", "strong vs eventual consistency", "sync vs async replication" — distributed systems' fundamental trade-offs show directly in AWS data service choice.** Second, **same problem (availability, scale, latency) get RDS/Aurora/ElastiCache each answer differently, exams ask "of these options, which best fits the constraint."**

Next week: NoSQL — DynamoDB — with nearly opposite philosophy to RDS (automatic sharding, eventual consistency option, unlimited scale, relational model sacrificed). Understanding RDS/Aurora makes DynamoDB's "why design this different" clear.

---

## 📝 Week 7 Comprehensive Exam: 12 Scenario Questions

**문제 1.** SaaS company runs production RDS MySQL. 500 Lambda functions burst-invoke, "Too many connections" errors. Simultaneously security team demands: "no password in code + auto-rotate + connection stability" all three. Best config?

A) Lambda env-var password (KMS encrypted) + reserved concurrency 50 + provisioned concurrency
B) RDS IAM Auth token solo, Lambda per-call SigV4 direct
C) RDS Proxy + Secrets Manager auto-rotate + Lambda IAM auth to Proxy
D) Migrate to DynamoDB + DAX cache, eliminate connection concept

**정답: C**

해설: Three requirements need ① RDS Proxy connection pool stability ② Secrets Manager auto-rotate ③ Lambda → Proxy auth via IAM (or Secrets ARN). Proxy auto-recognizes Secrets Manager updates, backend connection refresh seamless. A: concurrency limit hurts throughput. B: connection storm unsolved (15-min token + 200/sec limit). D: data model change excessive. Exam: "Lambda + RDS + three security/stability needs" = RDS Proxy + Secrets Manager combo.

---

**문제 2.** Fintech wants RDS fulfilling: ① RPO ≈ 0 ② standby supports analytics queries ③ failover < 60 sec. Best option?

A) RDS Multi-AZ Instance (1 sync standby) + 2 Read Replicas for analytics
B) RDS Multi-AZ Cluster Deployment (2022)
C) Aurora MySQL Multi-AZ
D) RDS Single-AZ + 7-day auto-backup + daily snapshot restore

**정답: B (also C valid)**

해설: Multi-AZ Cluster Deployment (MySQL/PostgreSQL 2022+): 1 writer + 2 readable standby + sync quorum → ① RPO≈0 ② standby-readable ③ failover ≤35 sec all three. A: Standby non-readable standard Multi-AZ. C: Aurora also satisfies but engine switch is larger change — Cluster Deployment closer. D: Single-AZ fails ①③.

---

**문제 3.** ElastiCache Redis Cluster Mode: hot key (popular product) traffic concentrated, one shard CPU 100%, others 5%. Most effective fix?

A) Disable Cluster Mode, single shard + 5 replicas for read
B) Hash tag: distribute key across multiple slots/shards (key sharding)
C) Upgrade instance class for hot shard headroom
D) Add more replicas

**정답: B (also D viable)**

해설: B core: "shard one key to sub-keys" (e.g., `product:123:shard{0}` ~ `product:123:shard{9}` → different slots/shards). Client random-reads, writes broadcast all shards. D: Read replicas help if reads are hot, but writes stay same shard. A: loses scale. C: bandaid, root issue unsolved. Exam: hot key + Cluster Mode → hash tag answer.

---

**문제 4.** Aurora MySQL: dev `DELETE FROM orders WHERE created_at > '2024-01-01'` mistake. Fastest recovery (< 30 min)?

A) PITR 5 min ago clone, mysqldump deleted rows
B) Backtrack in-place 5 min ago rewind
C) Manual failover, restart other AZ instance
D) Recent auto-snapshot restore new cluster

**정답: B**

해설: Backtrack: in-place seconds~min rewind (no new instance, no endpoint change). A: PITR new instance creation (30 min) + steps slow. C: failover irrelevant data recovery. D: snapshot restore min~hour + new cluster slow. Exam "Aurora MySQL quick mistake recovery" = Backtrack instant.

---

**문제 5.** Game company: real-time 100M-player leaderboard, rank < 10ms, 100K updates/sec. Best?

A) DynamoDB GSI + DAX rank cache
B) Redis Sorted Set (ZADD/ZREVRANK O(log N))
C) Aurora MySQL custom composite index + ORDER BY
D) S3 events + Athena batch ORDER BY

**정답: B**

해설: Redis Sorted Set exactly for this. ZADD O(log N), ZREVRANK O(log N) — 100M data, ~27 compares. Skip list + hash internal = fast sort + key. A: DynamoDB GSI N+1, cost. C: 100M ORDER BY minutes. D: batch analytic. Exam: "leaderboard/ranking/real-time score" → Redis Sorted Set instant answer.

---

**문제 6.** Medical SaaS: RDS PostgreSQL stores PII, HIPAA requires 1-year "who ran which query" audit. Missing which item?

(A) `pgaudit` extension + CloudWatch Logs export  
(B) `rds.force_ssl=1` parameter  
(C) KMS CMK (customer-managed key) instance encryption  
(D) AWS Backup Vault Lock enable

A) A, C only
B) B, D only
C) A, B, C, D all
D) C, D only

**정답: C (A, B, C, D all)**

해설: HIPAA RDS standard checklist = all four. (A) Audit log (pgaudit) CloudWatch export → 1-year retention. (B) TLS block plaintext. (C) KMS CMK customer-managed rotate. (D) Vault Lock WORM ransomware defense. Missing any = audit finding.

---

**문제 7.** Aurora MySQL + ElastiCache Redis lazy-load 1h TTL: price changes but customers see old 1h. Fix?

A) TTL 5 min, hot products shorter
B) Write-Through pattern (update cache on product change)
C) Abandon cache, Aurora Read Replica direct
D) Switch Memcached for faster invalidation

**정답: B (A partial)**

해설: Core: DB updates unknown to cache. Write-Through at update API → DB + cache simultaneous, stale window eliminated. A: shortens window but incomplete + hit ratio drops. C: cache benefit lost. D: same pattern unresolved. Production: Write-Through + TTL (insurance) together. Robust: CDC/Streams event invalidation.

---

**문제 8.** Aurora MySQL globally: Tokyo ops, US/EU users < 50ms read latency, Tokyo region down → auto promote. Best?

A) Aurora Cross-Region Read Replica each, binlog async
B) Aurora Global Database (Primary: Tokyo, Secondary: US, EU)
C) Migrate DynamoDB Global Tables, app rewritten key-value
D) Aurora Multi-AZ expand 3 AZ, Route 53 geolocation

**정답: B**

해설: Aurora Global Database: ① dedicated infra cross-region < 1 sec lag ② managed failover RTO < 1 min ③ each secondary 15 read replica → region latency min. A: Cross-Region Replica viable but lag/failover weak. D: cross-region missing. "Auto" failover trap — "managed" needs operator trigger. Exam "global + < 1 sec + RDBMS" = Aurora Global.

---

**문제 9.** Dev/staging RDS cost minimize: 9-18 weekdays only, weekends/nights unused. Most cost-effective?

A) Single-AZ db.t3.micro + 1-year RI ~38% off, keep running
B) Multi-AZ db.t3.medium + Storage Auto Scaling
C) Aurora Serverless v2 (Min 0 ACU auto-pause)
D) EventBridge schedule: 18:00 stop, 09:00 start + stop-state storage cost

**정답: C**

해설: Aurora Serverless v2: no traffic → 0 ACU (~$0), scale second-level on demand. Dev/staging pattern = unpredictable brief bursts. A: 24h charge includes nights. B: Multi-AZ 2x. D: RDS Spot unsupported (EC2 only), stop-state charges storage/backup. Exam: "sporadic/unpredictable/dev" = Aurora Serverless v2.

---

**문제 10.** Multi-AZ RDS MySQL: minor patch auto-runs, weekday peak → 4 min downtime, transaction failures. Prevention?

A) Set `preferred-maintenance-window` to low-traffic time (e.g., Sun 03:00 UTC)
B) `auto-minor-version-upgrade` false, manual patch after staging test
C) RDS Proxy → connection stable
D) Migrate Multi-AZ Cluster (quorum 35 sec failover)

**정답: C (untrue)**

해설: RDS Proxy helps connection pooling but instance patch → Proxy offline too. A/B/D all effective: A: window timing; B: manual control; D: Cluster faster failover. C: doesn't solve backend down. Exam "patch downtime": ① window timing ② Multi-AZ ③ Cluster (faster failover).

---

**문제 11.** ElastiCache Redis down → cache empty → DB overwhelmed → cascading failure. Prevention?

A) Redis → Memcached multi-node, distribute failure
B) Multi-AZ + app single-flight + RDS Proxy + circuit breaker
C) RDS scale-up double, absorb burst
D) Reads ElastiCache-only, miss → blank response

**정답: B**

해설: Thundering herd defense = multi-layer: ① cache HA (Multi-AZ) ② single DB call per key (single-flight) ③ DB connection pool (RDS Proxy) ④ failure propagation halt (circuit breaker). A: Memcached no persistence/Multi-AZ — worse. C: cost only. D: app broken on miss. Exam: "cascading failure" = multi-layer defense.

---

**문제 12.** **DAX (DynamoDB Accelerator) NOT an answer** when?

A) DynamoDB read μs-to-ms latency cut (in-memory write-through cache)
B) DynamoDB read cost cut (cache hits = no RCU)
C) ElastiCache replacement general-purpose cache
D) Eventually Consistent repeat fast-path cache

**정답: C**

해설: DAX DynamoDB-only (in-memory write-through). ElastiCache like general data cache unsupported — APIs different. A/B/D all DAX use. Exam "DynamoDB cache" = DAX; "general cache" = ElastiCache distinct.

---

## 정리하며

Week 7 grasps two essentials: **First, distributed systems' fundamental CAP/PACELC trade-offs map directly to AWS data service choices.** **Second, same problem (availability, scale, latency) has RDS/Aurora/ElastiCache each answering, exams ask "given these constraints, which fits best."**

RDS = "1st-gen: existing DB to cloud"  
Aurora = "2nd-gen: DB redesigned cloud-native"  
DynamoDB = "3rd answer: relational model abandoned"

Same problem, three answers — knowing why Aurora differs from RDS is core to passing.

Next week: NoSQL territory — DynamoDB — with nearly opposite design (automatic sharding, eventual consistency option, limitless scale, relational model sacrificed). RDS/Aurora foundation makes "why design differently" crystal clear.

Good luck on the exam! 🚀
