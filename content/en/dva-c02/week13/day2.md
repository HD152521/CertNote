# Day 2 - Final Review 2: S3, DynamoDB, RDS, ElastiCache

📅 Date: August 10, 2026 (Monday)  
🎯 Topic: Final Review of Storage and Database Services  
⏱️ Study Time: Approximately 120 minutes

---

## 🎯 Learning Objectives

- Complete final review of core exam topics for S3, DynamoDB, RDS, and ElastiCache
- Solve database selection scenario questions

---

## 📖 Final Core Summary

### S3 Core Memory Anchors
```
Max object size: 5TB
Multipart: 5GB+ mandatory, 100MB+ recommended
Storage Classes: Standard > IA (30 days) > Glacier (90 days) > Deep Archive (180 days)
Encryption: SSE-S3 (AWS-managed), SSE-KMS (KMS), SSE-C (customer key+HTTPS)
Block Public Access: Overrides bucket policy
Force HTTPS: Deny aws:SecureTransport=false
Versioning: Delete markers, Suspend only (cannot disable)
CRR/SRR: Versioning mandatory, existing objects not auto-replicated
Presigned URL: Max 7 days, PUT for direct upload
Static Website: HTTP only, HTTPS requires CloudFront+ACM
```

### DynamoDB Core Memory Anchors
```
Item max size: 400KB
RCU: Strong (1/4KB), Eventually (0.5/4KB), Transactional (2/4KB)
WCU: 1/1KB, Transactional 2/1KB
LSI: Same PK, different SK, creation-time only, strong consistency support
GSI: Different PK/SK, anytime, eventually consistent only, separate capacity
Streams: 24 hour retention, 4 view types
TTL: Free, async deletion within 48 hours
Transactional: Max 25 items, 4MB, cost 2x
Optimistic Locking: Version number prevents concurrent modifications
```

### RDS Core Memory Anchors
```
Multi-AZ: Synchronous replication, automatic failover, high availability
Read Replica: Asynchronous replication, read scaling, max 15
Encryption Change: Snapshot → encrypted copy → new DB
IAM Auth Token: 15 minutes valid
Auto Backup: Max 35 days, deleted with DB
Manual Snapshot: Indefinite, retained after DB deletion
Aurora: 3AZ 6 copies, 5x MySQL, Serverless, Global DB (<1 second)
```

### ElastiCache Core Memory Anchors
```
Redis: Persistence, backup, Multi-AZ, complex data structures
Memcached: Simple, multithreaded, no persistence
Lazy Loading: Cache Miss → DB query → cache store
Write-Through: Write to cache and DB simultaneously
```

---

## 🧠 Domain 1·2 Additional - Storage·DB Exam Prep Compression

### S3 Trap Collection (Frequently Tested)

| Trap | Answer |
|------|--------|
| "Max object size?" | **5 TB** |
| "Single PUT max?" | **5 GB** |
| "Multipart part min?" | **5 MB** (except last) |
| "Multipart parts max?" | **10,000** |
| "Can versioning be disabled?" | **❌** (Suspended only) |
| "Static website HTTPS?" | **❌** → CloudFront + ACM |
| "CloudFront ACM region?" | **us-east-1 required** |
| "OAI vs OAC?" | OAC recommended (SSE-KMS, SigV4 support) |
| "Strong consistency when?" | **2020 onwards all operations** |
| "Glacier min retention?" | **90 days** (Instant Retrieval/Flexible), Deep Archive **180 days** |
| "SSE-S3 header?" | `AES256` |
| "SSE-KMS header?" | `aws:kms` |
| "Bucket Key effect?" | KMS cost up to **99% reduction** |

### DynamoDB Trap Collection

| Trap | Answer |
|------|--------|
| "Item max size?" | **400 KB** |
| "Transactional max items?" | **100** (previously 25), 4MB |
| "LSI add timing?" | **Table creation only** |
| "GSI consistency?" | **Eventually Consistent only** |
| "Strong Consistency 1KB?" | **1 RCU** |
| "Eventually 1KB?" | **0.5 RCU** |
| "Transaction Write 1KB?" | **2 WCU** |
| "Streams retention?" | **24 hours** (fixed) |
| "Kinesis for DDB retention?" | Max **1 year** |
| "DAX purpose?" | DDB **microsecond** cache (VPC internal) |
| "MemoryDB vs ElastiCache Redis?" | Strong consistent vs Eventually |
| "Atomic Counter idempotency?" | ❌ — duplicate risk |
| "TTL deletion after expiry?" | 0~48 hours |
| "PartiQL?" | DDB SQL-compatible query |

### RDS·Aurora Traps

| Trap | Answer |
|------|--------|
| "Multi-AZ Standby read?" | **Not possible** (Cluster Deployment is) |
| "Read Replica max?" | RDS 5 / Aurora **15** |
| "Existing RDS encryption change?" | Snapshot → encrypted copy → new DB |
| "Aurora replicas?" | **3 AZ × 2 = 6** |
| "Aurora write quorum?" | **4/6** |
| "Aurora Replica Failover?" | **< 30 seconds** |
| "Aurora Global Replication?" | **< 1 second**, RTO < 1 minute |
| "Aurora Backtrack?" | MySQL only, 72 hours in-place |
| "RDS Proxy effect?" | Connection pooling·Lambda·Failover 66% ↓ |
| "IAM token?" | **15 minutes** + SSL required |
| "Auto backup max?" | **35 days** + deleted with DB |
| "Manual snapshot?" | Indefinite·retained after DB deletion |

### Redis vs Memcached One-Line Decision

| Need | Choice |
|------|--------|
| Persistence | **Redis** |
| Multi-AZ HA | **Redis** |
| Complex data structures | **Redis** |
| Sorted Set (leaderboard) | **Redis** |
| Simple multithreaded cache | **Memcached** |

---

## 📝 Final Mock Exam - Part 2

**문제 1.** How many RCU consumed when reading 5KB item with strong consistency in DynamoDB?

A) 1 RCU  
B) 1.5 RCU  
C) 2 RCU  
D) 3 RCU  

**정답: C** - ceil(5/4) × 1 = 2 RCU (strong consistency is 1 RCU/4KB)

---

**문제 2.** S3 bucket policy condition to enforce HTTPS only?

A) aws:SecureTransport = true  
B) aws:SecureTransport = false → Deny  
C) s3:ssl = required  
D) aws:RequestedRegion setting  

**정답: B** - Deny requests with `aws:SecureTransport=false` to reject HTTP and enforce HTTPS only.

---

**문제 3.** Can you add GSI to RDS table while running?

A) Impossible (DynamoDB only)  
B) Possible, RDS supports index addition  
C) DynamoDB GSI can be added during operation  
D) Must migrate to new table  

**정답: C** - DynamoDB Global Secondary Index can be added/removed anytime after table creation.

---

**문제 4.** Disadvantage of Write-Through strategy in ElastiCache?

A) Old data exists in cache  
B) Additional cache update cost for every write operation  
C) Increased Cache Miss frequency  
D) Implementation complexity  

**정답: B** - Write-Through updates both DB and cache on every write, causing write latency and additional cost.

---

**문제 5.** Prerequisite for S3 Cross-Region Replication (CRR)?

A) Same account only  
B) Versioning must be enabled  
C) Transfer Acceleration required  
D) S3 Sync tool required  

**정답: B** - Both source and destination buckets must have versioning enabled for CRR/SRR.

---

**문제 6.** Optimal use case for Aurora Serverless?

A) Always high-load service  
B) Intermittent and unpredictable traffic  
C) Multi-region service  
D) Very high read-load service  

**정답: B** - Aurora Serverless auto-scales down to 0 when traffic is absent, cost-efficient for intermittent usage.

---

**문제 7.** Time until actual deletion after DynamoDB TTL expiry?

A) Immediately  
B) 1 hour  
C) Max 48 hours  
D) 7 days  

**정답: C** - TTL items are deleted asynchronously within 48 hours after expiry.

---

**문제 8.** Minimum retention period to move to Glacier in S3 Lifecycle?

A) 1 day  
B) 30 days  
C) 90 days  
D) 180 days  

**정답: C** - S3 Glacier has 90-day minimum retention requirement.

---

## 📌 Today's Summary

1. S3: Force HTTPS (SecureTransport), versioning, CRR (versioning required), storage classes
2. DynamoDB: RCU/WCU calculation, LSI (creation-time only)/GSI (anytime), TTL (48 hours), transactional (2x cost)
3. RDS: Multi-AZ (sync/failover) vs Read Replica (async/read scaling)
4. Aurora: 3AZ 6 copies, 5x MySQL, Serverless (intermittent), Global (<1 second)
5. ElastiCache: Redis (persistence/complex) vs Memcached (simple/multithreaded)
