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
Write-Through: Cache is also updated on write
```

---

## 🧠 Domains 1·2 Additional - Storage·DB Last-Minute Compressed Review

### S3 Trap Collection

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
| "Strong consistency since when?" | **2020 onwards, all operations** |
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
| "DAX purpose?" | DDB **microsecond** cache (inside the VPC) |
| "MemoryDB vs ElastiCache Redis?" | Strong consistent vs Eventually |
| "Atomic Counter idempotency?" | ❌ — duplicate risk |
| "Deletion time after TTL expiry?" | 0~48 hours |
| "PartiQL?" | SQL-compatible query language for DDB |

### RDS·Aurora Traps

| Trap | Answer |
|------|--------|
| "Multi-AZ Standby read?" | **Not possible** (possible with Cluster Deployment) |
| "Read Replica max?" | RDS 5 / Aurora **15** |
| "Existing RDS encryption change?" | Snapshot → encrypted copy → new DB |
| "Aurora copies?" | **3 AZ × 2 = 6** |
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

## 🗺️ Choosing the Data Tier: A Decision Tree Instead of a Table

Storage and DB questions are posed not as "service descriptions" but as "requirement lists." So rather than memorizing per-service feature tables, it is much faster to hold a tree of **which word, when you meet it, sends you where** in the requirements.

```
Words to look for first in the requirement sentence
────────────────────────────────────────────────────────────
"file" · "image" · "static asset" · "archive"
        └─▶ S3 ── How often is it accessed? ── Often → Standard
                              ├─ Occasionally (30+ days) → Standard-IA / One Zone-IA
                              ├─ Rarely (90+ days) → Glacier family
                              └─ Unpredictable pattern → Intelligent-Tiering

"lookup by key" · "milliseconds" · "unlimited scale" · "serverless"
        └─▶ DynamoDB ── Needs to be faster? → + DAX (microseconds, inside the VPC)
                     ├─ Need change history? → Streams (24h) / Kinesis (up to 365 days)
                     └─ Multi-Region writes? → Global Tables (Last Writer Wins)

"join" · "transaction" · "SQL" · "migrating an existing application"
        └─▶ RDS ── Availability? → Multi-AZ (synchronous, automatic failover)
                 ├─ Read scaling? → Read Replica (asynchronous, RDS 5 / Aurora 15)
                 ├─ Connection storm (Lambda)? → RDS Proxy
                 └─ Intermittent, unpredictable → Aurora Serverless

"cache" · "session" · "leaderboard" · "Pub/Sub"
        └─▶ ElastiCache ── Need persistence, HA, data structures? → Redis
                        └─ Simple string cache, multithreaded → Memcached

"Multiple EC2 instances share the same files" → EFS      "Ultra-fast temporary disk" → Instance Store
```

The crossroads in this tree that is easiest to confuse is **Multi-AZ vs Read Replica**. Both "create a replica," but their purposes are opposite. Multi-AZ aims at automatic switchover on failure (high availability) with **synchronous replication + a standby instance**, and in principle the standby instance cannot be used for reads. A Read Replica shares the read load using **asynchronous replication**; because replication lag exists, it must not be used on a path that "needs to read a value immediately after writing it." On the exam, if the word "performance improvement" appears, Multi-AZ is a wrong answer; if "minimize downtime during failure" appears, Read Replica is a wrong answer.

The difference between synchronous and asynchronous replication is a trade-off between consistency and latency. Synchronous replication responds after committing the write in two places, so consistency (C) is good but write latency (L) increases, and if one side slows down, everything slows down. Asynchronous replication responds to the write quickly, but the replica lags briefly and becomes eventually consistent. Aurora resolved this dichotomy by moving it to the storage layer: it keeps 6 copies across 3 AZs and handles a **write quorum of 4/6** and a read quorum of 3/6, so writes continue even if an entire AZ disappears, while latency waits only as long as the quorum. When you memorize the numbers "6 copies, 4/6 quorum," if you also attach why the quorum is larger than a simple majority (to survive one AZ plus one more disk dying at the same time), you will not forget it.

---

## 🪣 S3 as Code: Presigned URLs and Bucket Policies

The most practical axis of S3 questions is the requirement to "**let the client upload and download directly without going through a server**." The answer is a presigned URL.

```python
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3", region_name="ap-northeast-2")

def create_upload_url(bucket: str, key: str, expires: int = 900) -> str:
    """A signed URL that lets the client PUT directly without going through the server."""
    try:
        return s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": "image/jpeg",
                "ServerSideEncryption": "aws:kms",   # enforce encryption on upload
            },
            ExpiresIn=expires,      # In seconds. Max 7 days (604800 seconds) under SigV4
        )
    except ClientError as e:
        # Signing itself is a local computation, so a failure here is usually a credentials/Region problem
        raise RuntimeError(f"presign failed: {e}") from e
```

There are two properties of presigned URLs you must point out. First, **the URL's permissions cannot exceed the permissions of the principal that created the URL.** If the Lambda execution role lacks `s3:PutObject`, the URL is created but returns 403 when used. Second, **the expiration time is also bound to the lifetime of the signing credentials.** If the role's temporary credentials last 1 hour, even if you issue a 7-day URL, it becomes invalid the moment those credentials end. If you memorize only the number "7 days" and miss this condition, it becomes a problem in practice.

```json
// Bucket policy — enforce HTTPS + deny unencrypted uploads
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::my-media-bucket",
        "arn:aws:s3:::my-media-bucket/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    },
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::my-media-bucket/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    }
  ]
}
```

The exam point is that it must take the form of **Deny**ing `aws:SecureTransport=false`. If you write it as "Allow `true`," an Allow elsewhere may still permit HTTP, so it does not enforce anything. Enforcement is always applied with a Deny.

### Three Encryption Methods: Who Holds the Key

| Method | Key ownership/management | Request header | Audit (CloudTrail) | Characteristics |
|------|------------|----------|-----------------|------|
| **SSE-S3** | AWS manages everything | `AES256` | No key usage log | Simplest, no extra cost |
| **SSE-KMS** | KMS key (customer-managed possible) | `aws:kms` | **Key usage records remain** | Strong access control and auditing, KMS API calls occur |
| **SSE-C** | **Customer provides the key with every request** | Key passed in headers | AWS does not store the key | **HTTPS required**, no recovery if the key is lost |

> ⚠️ **Pitfall**: If you use SSE-KMS on a high-traffic bucket, **the KMS API is called on every object access**, so you hit the KMS request limit and costs also surge. The fix is the **S3 Bucket Key**: it places an intermediate key at the bucket level to reduce the number of KMS calls, and through this lowers KMS cost by up to 99%. If "cost surge/throttling after using SSE-KMS" appears on the exam, the answer is usually the Bucket Key. One more thing: static website hosting supports **HTTP only**, so if HTTPS is required, CloudFront + ACM (with the certificate in **us-east-1**) must appear together.

```bash
# For large uploads the CLI splits into multipart automatically (default behavior above 8MB)
aws s3 cp ./bigfile.zip s3://my-media-bucket/backups/bigfile.zip \
  --sse aws:kms --sse-kms-key-id alias/media-key

# Incomplete multipart uploads keep costing money — always check and clean up
aws s3api list-multipart-uploads --bucket my-media-bucket
aws s3api abort-multipart-upload \
  --bucket my-media-bucket --key backups/bigfile.zip --upload-id "EXAMPLE_ID"

# Root-cause remedy: automatically clean up incomplete multipart uploads with a lifecycle rule
aws s3api put-bucket-lifecycle-configuration --bucket my-media-bucket \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "abort-incomplete-mpu",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    }]
  }'
```

A typical cause of the report "the S3 bill shows capacity I never stored" is **incomplete multipart uploads**. If an upload is cut off midway, the parts already uploaded remain in the bucket but do not appear in the object listing (`ListObjects`). This is how you end up in a situation where no matter how hard you search the console, there are no files, yet storage charges keep coming. The remedy is to set an `AbortIncompleteMultipartUpload` lifecycle rule as above, and it is a good idea to set this rule on production buckets.

S3 request performance **scales per prefix**. It handles 3,500 PUT/COPY/POST/DELETE requests per second and 5,500 GET/HEAD requests per second per prefix, and adding prefixes increases that linearly. So a key design with the date up front, such as `logs/2026-08-10/...`, concentrates load on one prefix because requests pile up on a particular date, but putting a hash up front, such as `logs/a3f/2026-08-10/...`, spreads it across multiple prefixes. This idea of "scattering the leading part to distribute" is exactly the same idea as DynamoDB's write sharding: even when the store differs, the principle that **hotspots are created by the front part of the key** repeats.

---

## 🧮 DynamoDB: Calculations and Conditional Writes

For capacity calculations, recall the **base unit** before the formula. Reads are 4KB, writes are 1KB, always rounded up (ceil).

```
Strongly consistent read   = ceil(item KB / 4) × 1 × requests per second
Eventually consistent read = ceil(item KB / 4) × 0.5 × requests per second
Transactional read         = ceil(item KB / 4) × 2 × requests per second

Standard write             = ceil(item KB / 1) × 1 × requests per second
Transactional write        = ceil(item KB / 1) × 2 × requests per second

Quick check: 5KB strong read, 100 per second → ceil(5/4)=2 → 2×1×100 = 200 RCU
             5KB standard write, 100 per second → ceil(5/1)=5 → 5×1×100 = 500 WCU
             Even for the same item, writes are overwhelmingly more expensive
```

Concurrent modification problems are solved with a **conditional write**. Optimistic Locking is not a separate feature but an application of conditional writes.

```python
from botocore.exceptions import ClientError

def update_stock_safely(table, product_id: str, expected_version: int, new_stock: int):
    """Update only if the version is unchanged — fail if someone else changed it first."""
    try:
        table.update_item(
            Key={"PK": f"PRODUCT#{product_id}", "SK": "DETAIL"},
            UpdateExpression="SET stock = :s, version = :nv",
            ConditionExpression="version = :ev",          # the core of optimistic locking
            ExpressionAttributeValues={
                ":s": new_stock,
                ":nv": expected_version + 1,
                ":ev": expected_version,
            },
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # Another request updated it first → re-read the latest item and retry
            raise ConcurrencyConflict(product_id) from e
        raise
```

Without a `ConditionExpression`, the last write silently overwrites the earlier one (lost update). Conversely, an **atomic counter** like `ADD stock :delta` is safe for concurrency but **not idempotent**: if the same request arrives twice, it is added twice. "Concurrency-safe" and "retry-safe (idempotent)" are different problems, and the exam asks about them separately.

| Situation | Right tool |
|------|------------|
| Create only if the item does not exist | `ConditionExpression: attribute_not_exists(PK)` |
| Modify only if no one else changed it | Version attribute + `ConditionExpression` (optimistic locking) |
| Increment/decrement view counts or stock | `ADD` (atomic counter) — but beware of duplicate calls |
| All succeed / all fail across multiple items | `TransactWriteItems` (2x WCU) |
| Prevent duplicate calls | `attribute_not_exists` insert keyed by request ID (idempotency table) |

### Telling Causes Apart by DynamoDB Error

| Error | Meaning | Remedy |
|------|-----|------|
| `ProvisionedThroughputExceededException` | Capacity exceeded (throttling) | Increase RCU/WCU, switch to on-demand, relieve hot partitions |
| `ConditionalCheckFailedException` | Condition not met | Re-read and retry (a designed signal, not an error) |
| `ValidationException` | Request format/size violation | Check for item over 400KB, missing key, use of reserved words |
| `TransactionCanceledException` | Part of a transaction failed | Check the failed items via `CancellationReasons` |
| `ItemCollectionSizeLimitExceededException` | LSI item collection exceeded 10GB | Redesign the LSI or switch to a GSI |
| `ResourceNotFoundException` | Table/index does not exist | Check Region, name, and whether GSI creation has completed |

> ⚠️ **Pitfall**: When you encounter throttling, the reflex is to raise capacity, but in many cases **only a particular partition blows up even though the table as a whole has spare capacity**. The upper limit a single partition can handle is about 3,000 RCU and 1,000 WCU, and if the partition key has low cardinality, such as `status` or `date`, traffic concentrates on one partition. The answer then is not to increase capacity but to **change the key design (sharding, a high-cardinality key)**. If the sentence "throttling continues even after increasing capacity" appears on the exam, immediately suspect a hot partition.

---

## 🔌 RDS and ElastiCache: Connections and Caching in Practice

The Lambda + RDS combination is a spot where serverless easily runs into trouble. Functions can scale to hundreds in an instant, but RDS's maximum number of connections is tied to the instance size. That is where **RDS Proxy** comes in: it pools and reuses connections, greatly reduces failover time, and integrates IAM authentication and Secrets Manager.

```bash
# Connect with an IAM authentication token instead of a password (token valid 15 min, SSL required)
TOKEN=$(aws rds generate-db-auth-token \
  --hostname myproxy.proxy-abc123.ap-northeast-2.rds.amazonaws.com \
  --port 3306 --region ap-northeast-2 --username app_user)

mysql --host=myproxy.proxy-abc123.ap-northeast-2.rds.amazonaws.com \
      --port=3306 --user=app_user --password="$TOKEN" \
      --ssl-ca=/opt/rds-ca-bundle.pem

# To encrypt an existing unencrypted RDS? Snapshot → encrypted copy → restore (no in-place option)
aws rds create-db-snapshot --db-instance-identifier prod-db --db-snapshot-identifier prod-snap
aws rds copy-db-snapshot --source-db-snapshot-identifier prod-snap \
  --target-db-snapshot-identifier prod-snap-enc --kms-key-id alias/rds-key
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier prod-db-enc --db-snapshot-identifier prod-snap-enc
```

The answer to "Can you turn on encryption for an RDS that is already running?" is **No: copy the snapshot while encrypting it, then restore it as a new instance**. Just remember the principle that encryption is a property fixed at creation time.

The difference between caching strategies is clear when you see it in code.

```python
# Lazy Loading (Cache-Aside): populate only on read
def get_product(product_id):
    cached = redis.get(f"product:{product_id}")
    if cached:
        return json.loads(cached)                  # cache hit
    row = db.query_product(product_id)             # cache miss → DB
    redis.setex(f"product:{product_id}", 300, json.dumps(row))  # TTL is a must
    return row

# Write-Through: update the cache together on write
def update_product(product_id, payload):
    db.update_product(product_id, payload)
    redis.setex(f"product:{product_id}", 300, json.dumps(payload))
```

| Strategy | Pros | Cons | Fits when |
|------|------|------|--------------|
| **Lazy Loading** | Caches only data actually read, resilient to cache failure | First request is always slow (miss), stale values if an update is missed | Read-heavy, only part of the data is hot |
| **Write-Through** | Cache is always fresh | Cost on every write, data that is never read also occupies the cache | Pattern of reading right after writing |
| **TTL alongside** | Offsets the stale-value problem of both with time | Not perfect freshness | Effectively the default in every practical setup |

In practice you do not choose one of the two; you lay down **Lazy Loading + TTL** as the default and add Write-Through only on the few keys that need immediate freshness. On the exam, the symptom "stale data is visible" means missing TTL or missed invalidation, and the symptom "writes got slower" is the price of Write-Through.

As a hypothetical case, a service that introduced a cache fell over from DB load right after an early-morning deployment. The cause was a **cache stampede**: when the cache is cleared, or a large number of keys hit their TTL expiry at the same time, thousands of requests miss simultaneously and all rush to the DB. The mitigations are (1) add random jitter to the TTL to scatter expiry times, (2) lock so that only one request per key goes to the DB (single-flight), and (3) warming, pre-populating the critical keys after deployment. A scenario like "we turned on the cache and an outage occurred instead" may be this phenomenon.

---

## Wrap-Up

Exam questions in the storage and DB area converge on a single question: **"What access pattern does this data have?"** If it is files, S3; if key lookups, DynamoDB; if joins and transactions, RDS; if speeding up repeated lookups, a cache.

The detailed rules layered on top are all answers to "how do you prevent the side effects that access pattern produces?"

- Enforce S3 requirements with Deny conditions.
- Reduce KMS cost with the Bucket Key.
- Switch encryption by copying a snapshot.
- Handle DynamoDB concurrency with conditional writes.
- Stop Lambda's connection storm with RDS Proxy.

The numbers (5TB, 400KB, 35 days, 15 minutes, 48 hours) are values to confirm last; the thing to grasp first is the access pattern.

---

## 📝 Final Mock Exam - Part 2

**Question 1.** How many RCU consumed when reading 5KB item with strong consistency in DynamoDB?

A) 1 RCU  
B) 1.5 RCU  
C) 2 RCU  
D) 3 RCU  

**Answer: C** - ceil(5/4) × 1 = 2 RCU (strong consistency is 1 RCU/4KB)

---

**Question 2.** S3 bucket policy condition to enforce HTTPS only?

A) aws:SecureTransport = true  
B) aws:SecureTransport = false → Deny  
C) s3:ssl = required  
D) aws:RequestedRegion setting  

**Answer: B** - Deny requests with `aws:SecureTransport=false` to reject HTTP and enforce HTTPS only.

---

**Question 3.** Can you add GSI to RDS table while running?

A) Impossible (DynamoDB only)  
B) Possible, RDS supports index addition  
C) DynamoDB GSI can be added during operation  
D) Must migrate to new table  

**Answer: C** - DynamoDB Global Secondary Index can be added/removed anytime after table creation.

---

**Question 4.** Disadvantage of Write-Through strategy in ElastiCache?

A) Old data exists in cache  
B) Additional cache update cost for every write operation  
C) Increased Cache Miss frequency  
D) Implementation complexity  

**Answer: B** - Write-Through updates both DB and cache on every write, causing write latency and additional cost.

---

**Question 5.** Prerequisite for S3 Cross-Region Replication (CRR)?

A) Same account only  
B) Versioning must be enabled  
C) Transfer Acceleration required  
D) S3 Sync tool required  

**Answer: B** - Both source and destination buckets must have versioning enabled for CRR/SRR.

---

**Question 6.** Optimal use case for Aurora Serverless?

A) Always high-load service  
B) Intermittent and unpredictable traffic  
C) Multi-region service  
D) Very high read-load service  

**Answer: B** - Aurora Serverless auto-scales down to 0 when traffic is absent, cost-efficient for intermittent usage.

---

**Question 7.** Time until actual deletion after DynamoDB TTL expiry?

A) Immediately  
B) 1 hour  
C) Max 48 hours  
D) 7 days  

**Answer: C** - TTL items are deleted asynchronously within 48 hours after expiry.

---

**Question 8.** Minimum retention period to move to Glacier in S3 Lifecycle?

A) 1 day  
B) 30 days  
C) 90 days  
D) 180 days  

**Answer: C** - S3 Glacier has 90-day minimum retention requirement.

---

## 📌 Today's Summary

1. S3: Force HTTPS (SecureTransport), versioning, CRR (versioning required), storage classes
2. DynamoDB: RCU/WCU calculation, LSI (creation-time only)/GSI (anytime), TTL (48 hours), transactional (2x cost)
3. RDS: Multi-AZ (sync/failover) vs Read Replica (async/read scaling)
4. Aurora: 3AZ 6 copies, 5x MySQL, Serverless (intermittent), Global (<1 second)
5. ElastiCache: Redis (persistence/complex) vs Memcached (simple/multithreaded)
