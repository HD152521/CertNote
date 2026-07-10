# Day 4 - Aurora: How AWS Rewrote the RDBMS Storage Layer

Aurora confused many when first announced at 2014 re:Invent. "MySQL-compatible but not MySQL" — odd phrasing. AWS's message was clear — **SQL engine code uses MySQL/PostgreSQL nearly as-is, but the storage, replication, and transaction layers below are redesigned from scratch for cloud**. Result: "5x MySQL performance, 3x PostgreSQL + auto-scaling storage + < 1 sec cross-region replication."

In DVA-C02, Aurora appears almost as frequently as RDS but asks differently. RDS asks "managed DB trade-offs," Aurora asks "why is RDS insufficient, when to pick Aurora." Understanding that requires knowing Aurora's storage structure and quorum-based replication. Today we look inside.

## Aurora's Origin: "Database is Fundamentally Storage"

Traditional MySQL/PostgreSQL designed for 1990s single-server. Binlog/WAL on disk, backup copies disk, replication sends binlog elsewhere — cloud straight-lift brings ① EBS single volume risk — AZ failure vulnerable ② async binlog replication → lag ③ storage manual scale ④ backup/restore time proportional to instance size — all limitations follow.

2014 Aurora paper (SIGMOD 2017 "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases", Verbitski et al.) dropped key insight simply: **"Network is the new bottleneck. Reducing network traffic is performance."** Traditional DB commits do ① data page ② undo log ③ redo log ④ binlog ⑤ double-write buffer — same data written multiple forms to disk. AWS measurement: MySQL ~7.4 disk I/Os per commit. Aurora discards all, **sends only redo log to distributed storage, page reconstruction happens background on storage nodes**. Result: I/O reduced to 1/6, network traffic 7.7x less.

```
Normal MySQL commit:
  Application → MySQL
                  ↓
              Local disk writes (data page, redo log, undo log, binlog, double-write...)
                  ↓
              Binlog-based replica replication (async)

Aurora commit:
  Application → Aurora
                  ↓
              Send "redo log record" to 6 storage nodes only
                  ↓
              Commit when 4/6 ack
              (storage nodes background-reconstruct data page)
```

> 🔍 **Going Deeper**: Aurora storage node not simple EBS volume. **Small server able to reconstruct pages from redo log**. Storage node receives log records, appends to local disk, simultaneously creates page versions with that log applied. Read request asks "this page at this LSN version" — storage node instantly responds. Structure enables ① binlog vanishes ② replica has no own storage, shares primary storage ③ backup essentially free (continuous) ④ storage auto-expands (10GB segment add/remove). These are roots of Aurora's all differentiators.

## 6 Copies × 3 AZ + Quorum: "Survives Any Failure Combination"

Aurora storage's famous picture: "6 copies across 3 AZs." Number not arbitrary but **minimum from distributed systems fault tolerance math**.

```
3 AZ × 2 copies = 6 replicas

Write quorum: V_w = 4 (commit after 4/6 ack)
Read quorum: V_r = 3 (read from 3/6 valid)

V_w + V_r > N (4 + 3 > 6) → strong consistency
2 × V_w > N (8 > 6) → no concurrent write collision
```

This setup guarantees:

- **1 AZ + 1 extra node lost = readable** (3 remaining copies satisfy V_r)
- **Entire 1 AZ lost = writable** (4 remaining copies satisfy V_w)
- **2 AZs lost = no data loss** (2 remaining copies recoverable)

> 💡 **Related Theory**: Quorum replication originates 1979 Robert Thomas "majority consensus algorithm." 2007 Werner Vogels Dynamo paper moved to N/R/W notation for cloud scale; Cassandra, MongoDB, DynamoDB all use same model. Aurora (N=6, W=4, R=3) optimally balances "surviving simultaneous AZ + node failure." AZ-unit failure + node-unit failure survivable requires ① N≥6 ② N/AZ-value that N-W≥1 → 3 AZ × 2 = 6, W=4 is minimum. So 6 is math-derived optimum.

> 📚 **Case Study**: February 28, 2017, AWS S3 us-east-1 massive outage (~4 hours) — debug command typo downed index servers, full index restart. Aurora's quorum model: one AZ disappears → still hits V_w=4 with remaining copies, maintains consistency while alive. S3 went down, Aurora would survive. AWS then reinforced — "1 AZ + 1 node simultaneous loss = still readable" standard SLO.

## Aurora Replica: Shared Storage Makes Sub-ms Replication

RDS Read Replica: each replica owns storage, pulls primary's binlog, applies to own disk. Limits: ① per-replica storage cost ② replication lag binlog speed (seconds to tens sec) ③ adding replica needs initial sync time.

Aurora Replica: **no own storage**. Shares primary's distributed storage. Result:

- **10-20ms replication lag** (really just time to notify replica cache of redo log)
- **Instant add** (no storage copy)
- **Up to 15** (RDS 5)
- **Instance cost only** (no duplicate storage)

| Dimension | RDS Read Replica | Aurora Replica |
|------|------------------|----------------|
| Storage | Each own | Shared |
| Mechanism | Async binlog/WAL | Redo log notification (storage shared) |
| Replication lag | Seconds ~ minutes | 10-20ms |
| Max count | 5 (MySQL/PG/MariaDB now 15) | 15 |
| Initial sync | Full copy needed | Instant |
| Failover time | Manual promote (minutes) | Automatic (~30 sec) |

> ⚠️ **Trap**: Aurora Replica failover 30 sec **when same instance class**. Different-class replicas lower failover priority, post-failover performance drops. Exam "Aurora failover then slow" → replica size mismatch sometimes answers. **Tier 0-15** failover priority explicit control.

## Aurora Endpoints 5 Types: Deciding Connection Route

Aurora cluster-level endpoints (not instance-level like RDS). Five types requiring memorization.

| Endpoint | DNS Form | Role |
|-----------|---------|------|
| **Cluster Endpoint (Writer)** | `myclu.cluster-xxxx.region.rds.amazonaws.com` | Current primary auto-routed (auto-updates on failover) |
| **Reader Endpoint** | `myclu.cluster-ro-xxxx.region.rds.amazonaws.com` | All read replicas DNS round-robin (load balance) |
| **Custom Endpoint** | `myclu-analytics.cluster-custom-xxxx...` | User-specified instance group (e.g., analytics-only large replicas) |
| **Instance Endpoint** | `myinst-1.xxxx.region.rds.amazonaws.com` | Direct specific instance (ops debugging) |
| **Global Database Writer** | Auto-issued | Global DB all regions, auto-routes primary region writer |

> 🔍 **Going Deeper**: Reader Endpoint load balancing happens **DNS level**. Resolving same endpoint returns different replica IPs each time (TTL 5 sec). Gotcha: ① long-held connection pins to one replica — small pool = unbalanced ② stub resolver TTL cache (Java default: infinite) = no refresh. Production needs ① short connection lifetime ② Aurora cluster-aware library (MariaDB Connector/J Aurora-aware, Aurora Postgres JDBC wrapper) ③ RDS Proxy routing. Exam: "Reader Endpoint used but load to one replica only" → connection hold + DNS cache.

```python
# Practical: analytics workload via custom endpoint
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

## Aurora Serverless v2: ACU's Secret

Aurora Serverless auto-scales compute per traffic. Unit: **ACU (Aurora Capacity Unit)** — 1 ACU ≈ 2GB memory + proportional CPU/network. v1 vs v2 differences hit exams.

| Item | Aurora Serverless v1 (Legacy) | Aurora Serverless v2 (Recommended) |
|------|------------------------------|------------------------------|
| Scale unit | 2x jumps (2→4→8 ACU) | 0.5 ACU micro-steps |
| Speed | Minute-level | Second-level |
| Min Capacity | 1 ACU (or pause) | 0 ACU (auto-pause) ~ 0.5 ACU |
| Max Capacity | 256 ACU | 256 ACU |
| Cold start | After pause ~30 sec | Barely any |
| Multi-AZ | Option | Standard |
| Data API | ✅ | ✅ (2023+) |
| New | Deprecation underway | Recommended |

> 🔍 **Going Deeper**: v1 vs v2 biggest diff: **scaling mechanism**. v1 moves traffic to new instance (scale-up) — big jumps, slow. v2 hypervisor-level CPU/memory allocation adjustment — Firecracker microVM dynamic resource feature used for 0.5 ACU steps without instance swap. Enables "second-level micro-tuning."

> 💡 **Use Decision Tree**:
> - 24-hour steady traffic → regular Aurora (Reserved for cost cut)
> - Periodic predictable traffic → Aurora + Auto Scaling replicas
> - Sporadic unpredictable traffic → Aurora Serverless v2
> - Dev/staging (nighttime unused) → Aurora Serverless v2 (auto-pause)
> - Data API calls primary → Aurora Serverless v2

## Aurora Global Database: < 1 Sec Cross-Region Replication Secret

Aurora Global Database: **1 primary region + max 5 secondary regions**. Differs RDS Cross-Region Read Replica: ① dedicated replication infra (storage-level) ② typically lag < 1 sec ③ each secondary has own 15 read replicas ④ cross-region failover RTO < 1 min.

```
[Primary: ap-northeast-2 Seoul]
  Aurora Writer + Replicas
       │
       │ (storage-level replication, < 1sec)
       │
       ├──→ [Secondary: us-east-1 Virginia]
       │      Read-only Aurora cluster
       │      Own 0-15 read replicas
       │
       └──→ [Secondary: eu-west-1 Ireland]
              Read-only Aurora cluster
              Own 0-15 read replicas
```

> 🔍 **Going Deeper**: Aurora Global Database replication resembles redo log shipping but not binlog. Primary storage nodes send redo log additionally to secondary region storage nodes. Channel uses AWS backbone network (same backbone avg RTT 100-200ms), compression/dedup applied vs internet efficiency. Result: cross-region lag < 1 sec. Exam: "global distribution + < 1 sec lag + RDBMS" → nearly always Aurora Global Database.

| Dimension | RDS Cross-Region Read Replica | Aurora Global Database |
|------|--------------------------------|------------------------|
| Replication | Async binlog | Redo log shipping (dedicated infra) |
| Typical lag | Seconds ~ tens seconds | < 1 sec |
| Failover | Manual promote | Managed failover (< 1 min) |
| Secondary regions | Many possible (separate replicas) | Max 5 (managed cluster) |
| Secondary read replicas | N/A (itself replica) | 15 each region |
| RPO | Tens sec ~ minutes | < 1 sec |

> ⚠️ **Trap**: Aurora Global Database secondaries **read-only**. Write attempt = read-only error. Also "managed failover" needs explicit trigger, not automatic — primary region dies, operator executes promote. Auto-failover needs Route 53 health check + Lambda or RDS Proxy. Exam: "Aurora Global Database auto-fails" is trap.

## Aurora Backtrack vs PITR: In-Place Time Travel

Aurora MySQL exclusive — **Backtrack** — rewinds data to past point **without new instance** creation. PITR creates new instance; Backtrack rewinds same instance to past time only.

| Item | Backtrack | PITR |
|------|-----------|------|
| New instance creation | ❌ (in-place) | ✅ |
| Speed | Seconds ~ minutes | Minutes ~ hours (DB size dependent) |
| Support | Aurora MySQL only | RDS + Aurora |
| Max period | 72 hours | 35 days |
| Cost | Separate Backtrack window | Within auto-backup free tier |
| Scenario | "Just dropped table" instant rollback | "Yesterday incident" data recovery |

> 📚 **Case Study**: 2020 game company developer ran `DELETE FROM users` without WHERE on production Aurora MySQL (confused prod/dev). Backtrack enabled, "roll back 5 minutes" one console click ~3 minutes restored. PITR would need ① new instance (30 min) ② export/import (hours) ③ endpoint switch. "Backtrack saved us hours," they reported. Exam: "Aurora quick mistake recovery" → Backtrack answer.

## Aurora Database Cloning: COW Instant Clone

Aurora clusters **clone in seconds**. Clone shares storage copy-on-write — clone modifications trigger only that page's copy.

```
[Primary Aurora] ────┬──── [Clone A] (dev)
                     │
                     ├──── [Clone B] (test)
                     │
                     └──── [Clone C] (analytics)

Initially all share storage pages
Modification → only that page copied for clone (COW)
```

> 💡 **Practical Pattern**: Cloning production DB for dev testing is standard. Regular mysqldump takes hours on TB; Aurora clone nearly instant. CI/CD per-build clone for test, delete after — workflow common.

## RDS vs Aurora Decision Table

| Scenario Keywords | Recommendation |
|----------------|------|
| Standard MySQL/PostgreSQL/MariaDB/Oracle/SQL Server | RDS |
| 5x performance / 15 replicas / auto storage scale | Aurora |
| Global distribution + < 1 sec lag | Aurora Global Database |
| Sporadic traffic + auto-scale | Aurora Serverless v2 |
| 72-hour in-place rollback | Aurora MySQL Backtrack |
| Oracle/SQL Server BYOL | RDS (Aurora unsupported) |
| Minimal cost simple DB | RDS (~20% cheaper vs Aurora) |

## Wrapping Up

Aurora differentiators all flow from **"redesigned storage layer"** one sentence. 6-copy quorum ensures availability, shared storage makes replicas ms-latency, redo log shipping makes cross-region < 1 sec, copy-on-write clones instant. Exams ask this causality in scenario form — "which Aurora feature answers requirement X."

RDS is "existing DBMS to cloud" (1st gen managed DB), Aurora "DBMS redesigned cloud-native" (2nd gen). DynamoDB "relational model abandoned" (different answer). Same problem (persistence, scale, availability) — three answers. Understanding why Aurora differs from RDS is core to passing.

Next: Week 7 synthesis, RDS + ElastiCache + Aurora scenario comprehensives.

---

## 📝 연습 문제

**문제 1.** Aurora storage config is?

A) Single AZ 1 replica
B) Single AZ 6 replicas
C) 3 AZ 6 replicas, write quorum 4/6
D) 2 AZ 3 replicas, write quorum 2/3

**정답: C**

해설: Aurora 3 AZ × 2 replicas = 6, write quorum V_w=4, read quorum V_r=3. V_w + V_r > N (4+3>6) strong consistency. Single AZ failure still write-capable (4 copies V_w), 1 AZ + 1 node loss still read-capable (3 copies V_r). Math-optimized minimums.

---

**문제 2.** Aurora Replica vs RDS Read Replica biggest difference?

A) Aurora Replica uses async binlog replication
B) Aurora Replica no own storage, primary-shared → 10-20ms lag, very short
C) RDS Read Replica max 30
D) Identical

**정답: B**

해설: Aurora Replica core: no own disk, shares primary distributed storage. Replication: redo log notification → lag 10-20ms (RDS Read: seconds~tens sec). A: Aurora no binlog. C: RDS max 15 (MySQL/PG/MariaDB 2022 upward). D: Major differences.

---

**문제 3.** SaaS Aurora MySQL globally, Tokyo read latency < 100ms needed, Tokyo region down → 1 min failover. Best config?

A) Tokyo Aurora Multi-AZ only
B) Tokyo Aurora + Virginia/Ireland Cross-Region Read Replicas each
C) Aurora Global Database (Primary: Tokyo, Secondary: Virginia, Ireland)
D) DynamoDB Global Tables

**정답: C**

해설: Aurora Global Database: ① dedicated infra cross-region lag < 1 sec ② managed failover RTO < 1 min ③ each secondary region own 15 read replicas → region latency min. B: Cross-Region Read Replica viable but lag/failover automation weak. A: cross-region scatter missing. D: RDBMS compatibility lost. "Auto" failover phrase trap — "managed" still requires operator trigger.

---

**문제 4.** Aurora Serverless v2 untrue statement?

A) 0.5 ACU unit micro-adjust
B) Cold start barely any, fast expand
C) v1 vs v2 differ: v2 second-level vs v1 minute-level
D) Min capacity always ≥ 1 ACU

**정답: D**

해설: D false. Aurora Serverless v2 Min 0.5 ACU (auto-pause to 0 ACU post-2024). v1: 1 ACU min. A: 0.5 unit fine-tuning. B: Firecracker microVM resource adjust, no instance swap. C: v2 hypervisor-level, v1 instance-swap. Exam v1 vs v2: "v2 fine-tune + fast + cold start none."

---

**문제 5.** Aurora Backtrack true statement?

A) RDS + Aurora both support
B) Max 35 days rollback
C) Aurora MySQL only, in-place time-rewind (no new instance)
D) Identical mechanism to PITR

**정답: C**

해설: Backtrack: Aurora MySQL feature, same cluster past-time in-place (seconds~min). New instance creation doesn't happen. Speed: sec~min. A: RDS unsupported. B: max 72 hours, not 35 days. D: PITR different mechanism (new instance + backup+log replay). Exam "Aurora quick mistake recovery" → Backtrack.

---

**문래 6.** Aurora Reader Endpoint load balance is?

A) Application round-robin
B) DNS: resolve same endpoint → different replica IP each time (TTL 5 sec)
C) Network Load Balancer
D) Application Load Balancer

**정답: B**

해설: Aurora Reader Endpoint DNS round-robin — resolve same endpoint, get different replica IP each time (TTL 5 sec). Long-held connection → one replica pinned, small pool → unbalanced. Fix: short connection lifetime, cluster-aware client, or RDS Proxy. C/D: irrelevant to Aurora endpoint.

---

**문제 7.** SaaS production Aurora MySQL: developer runs `DELETE FROM orders WHERE created_at > '2024-01-01'` mistake. Fastest recovery (< 30 min)?

A) PITR new cluster 5 min ago, export/import deleted rows
B) Backtrack in-place 5 min ago rollback
C) Multi-AZ failover manual, restart another AZ instance
D) Recent auto-snapshot restore, new cluster, endpoint switch

**정답: B**

해설: Backtrack: in-place seconds~min (no new instance, no endpoint switch). A: PITR new instance (30 min) + endpoint switch procedure slow. C: failover unrelated data recovery. D: snapshot restore min~hour + new instance steps slow. Exam "Aurora MySQL fast mistake recovery" = Backtrack instant.
