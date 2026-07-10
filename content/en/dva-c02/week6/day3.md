# Day 3 - DynamoDB: RCU/WCU Mathematics, DAX Architecture, Streams Processing

Many developers are shocked when receiving their first DynamoDB bill. The amount often runs 10× or 100× higher than expected for three reasons — RCU/WCU calculation mistakes, wrong choice between on-demand and provisioning modes, and wasted capacity from incomplete work. In this day, we understand RCU/WCU calculation precisely through mathematics, how DAX manages caching, and how DynamoDB Streams connects with Lambda.

## The Mathematics of RCU Calculation — ceil function is key

RCU (Read Capacity Unit) calculation formula:

```
Strongly Consistent RCU = ceil(item size / 4KB) × 1
Eventually Consistent RCU  = ceil(item size / 4KB) × 0.5
Transactional Read RCU    = ceil(item size / 4KB) × 2
```

**ceil** is the ceiling function. A 4.1KB item: ceil(4.1/4) = ceil(1.025) = 2.

Frequently appearing RCU calculation examples on exams:

```
Example 1: 1KB item, Eventually Consistent reads 100/sec
  RCU = ceil(1/4) × 0.5 × 100 = 1 × 0.5 × 100 = 50 RCU

Example 2: 6KB item, Strongly Consistent reads 50/sec
  RCU = ceil(6/4) × 1 × 50 = 2 × 1 × 50 = 100 RCU

Example 3: 9KB item, Transactional reads 20/sec
  RCU = ceil(9/4) × 2 × 20 = 3 × 2 × 20 = 120 RCU

Example 4: 400KB item (max size), Eventually Consistent 10/sec
  RCU = ceil(400/4) × 0.5 × 10 = 100 × 0.5 × 10 = 500 RCU
```

## The Mathematics of WCU Calculation

WCU (Write Capacity Unit) calculation formula:

```
Standard Write WCU      = ceil(item size / 1KB)
Transactional Write WCU  = ceil(item size / 1KB) × 2
```

WCU is based on 1KB — different from RCU's 4KB. Missing this difference makes calculations wrong by 4×.

```
Example 1: 2.5KB item, standard write 10/sec
  WCU = ceil(2.5/1) × 1 × 10 = 3 × 10 = 30 WCU

Example 2: 0.5KB item, transactional write 50/sec
  WCU = ceil(0.5/1) × 2 × 50 = 1 × 2 × 50 = 100 WCU

Example 3: 7KB item, standard write 5/sec
  WCU = ceil(7/1) × 1 × 5 = 7 × 5 = 35 WCU
```

> ⚠️ **Trap**: WCU is 1KB-based, RCU is 4KB-based. Confusing them makes calculation wrong by 4×. Memorize: "writes are more expensive" — same item consumes 4× more WCU units than RCU (Strongly Consistent).

## On-Demand vs Provisioning — The Mathematics of Selection Criteria

| Aspect | Provisioning + Auto Scaling | On-Demand |
|------|------------------------|---------|
| Pricing | Per-hour RCU/WCU charge | Per-request charge |
| Price ratio | Baseline | ~2~3× more expensive |
| Predictability | Favorable for predictable traffic | Favorable for unpredictable traffic |
| Management | Auto Scaling policy required | No configuration |
| Max throughput | Set value | 2× previous peak (warmed up) |
| Mode switch | To on-demand once/24hr | To provisioning once/24hr |

On-demand suitable situations: ① New service (traffic unpredictable), ② Batch jobs (irregular heavy processing), ③ Dev/test environment, ④ Completely random traffic pattern.

Provisioning suitable situations: ① Stable, predictable traffic, ② Cost optimization important for large services, ③ Using Reserved Capacity (~76% discount).

> ⚠️ **Trap**: On-demand mode doesn't scale infinitely. Starts at minimum throughput on initial setup and auto-scales only to 2× previous traffic peak. If traffic suddenly surges 10×, even an on-demand table not "warmed up" will throttle. Warming method: Run in provisioning mode for sufficient time to handle adequate traffic before switching to on-demand.

## DAX Architecture — The Meaning of Write-Through Cache

DAX (DynamoDB Accelerator) is a DynamoDB-exclusive in-memory cache. Reduces response time from milliseconds (ms) to microseconds (μs).

DAX is a fully managed cluster. Consists of one Primary node and multiple Read Replica nodes. Clients use DAX SDK instead of DynamoDB SDK but API is identical.

**DAX's two caches**:

```
1. Item Cache
   - Target: GetItem, BatchGetItem results
   - TTL: Default 5 minutes (adjustable)
   - On cache miss: Read from DynamoDB, store in cache, return

2. Query Cache
   - Target: Query, Scan results
   - TTL: Default 5 minutes (adjustable)
   - Same query with same parameters returns from cache
   - Cache key: Hash of table name + all parameters
```

**DAX read flow**:
```
Client → DAX cluster
            ↓ Cache hit?
            YES → Return from cache immediately (~μs)
            NO  → Read from DynamoDB → Store in cache → Return (~ms)
```

**DAX write flow (Write-Through)**:
```
Client → DAX cluster
            ↓
            Write to DynamoDB (synchronously)
            ↓
            Update Item Cache
            ↓
            Return completion
```

Write-Through meaning: When write request arrives at DAX, DAX writes to DynamoDB first, and only updates cache upon success. Unlike Write-Back where writes only hit cache, there's no data loss risk.

> 💡 **Related theory**: Three cache strategies — Lazy Loading (Cache-Aside): app reads from DB on cache miss and stores in cache. Write-Through: update cache and DB simultaneously on write. Write-Back (Write-Behind): write hits cache only, async reflection to DB later. DAX uses Lazy Loading for reads, Write-Through for writes. ElastiCache can implement all three but requires developer to code cache logic.

**DAX's important constraints**:

1. **Strongly Consistent reads bypass cache** — `ConsistentRead: true` requests make DAX query DynamoDB directly. DAX benefits lost for always-latest-data cases.

2. **VPC-only access** — ENI created in DAX cluster, accessible only inside VPC. No direct internet access.

3. **No write performance improvement** — DAX is a read cache. Writes always go through DynamoDB.

## DAX vs ElastiCache — When to Use Which

| Item | DAX | ElastiCache(Redis) |
|------|-----|-------------------|
| Target data | DynamoDB-only | Any data |
| API compatibility | Same as DynamoDB SDK | Separate Redis/Memcached API |
| Cache logic | Automatic (transparent) | Developer-implemented |
| TTL management | Automatic (DAX handles) | Developer configures |
| Cache invalidation | DAX auto on write | Developer manually deletes |
| Use cases | DynamoDB read acceleration | Session management, Pub/Sub, complex caching |
| Cost | DAX node hourly charge | ElastiCache node hourly charge |

Exam scenario: "DynamoDB read response is ms level, want μs level" → DAX. "Fast session data storage needed" → ElastiCache Redis. "Cache various DBs regardless of DynamoDB" → ElastiCache.

> 📚 **Case study**: Netflix uses DynamoDB for user watch history and recommendation data, places DAX in front to cache the repeated access patterns to same episode lists. According to Netflix internal presentation, 70%+ of peak-time DynamoDB reads are satisfied by DAX cache hits, significantly reducing DynamoDB provisioning costs.

## DynamoDB Streams — Real-time Streaming of Change History

DynamoDB Streams is a time-ordered change log recording all item changes (INSERT, MODIFY, REMOVE) in order.

**Streams internal structure**:
- One Stream shard per table partition
- Event order guaranteed within partition key
- 24-hour retention (fixed, unchangeable)
- Consumed by Lambda or KCL (Kinesis Client Library)

**4 Stream view types**:

```
KEYS_ONLY:          Only PK and SK of changed items
NEW_IMAGE:          Full item after change
OLD_IMAGE:          Full item before change
NEW_AND_OLD_IMAGES: Both before and after (audit logs)
```

**Lambda + Streams integration method**:

Lambda polls Streams via **Event Source Mapping (ESM)**. Lambda periodically checks Streams, not Streams calling Lambda directly.

```python
# Lambda handler (process DynamoDB Streams events)
def handler(event, context):
    for record in event['Records']:
        event_name = record['eventName']  # INSERT, MODIFY, REMOVE
        
        if event_name == 'INSERT':
            new_item = record['dynamodb']['NewImage']
            # Process new item
            
        elif event_name == 'MODIFY':
            old_item = record['dynamodb']['OldImage']
            new_item = record['dynamodb']['NewImage']
            # Process before/after comparison
            
        elif event_name == 'REMOVE':
            old_item = record['dynamodb']['OldImage']
            # Process deleted item
```

| ESM Setting | Description |
|---------|------|
| BatchSize | Records to process per invocation (max 10,000) |
| BisectBatchOnFunctionError | Split batch in half on error, retry separately |
| DestinationConfig | Send failed records to SQS DLQ or SNS |
| MaximumRetryAttempts | Maximum retry attempts |
| ParallelizationFactor | Parallel Lambdas per shard (default 1, max 10) |

**One Lambda per shard**: By default, one Stream shard is processed sequentially by one Lambda instance. Increasing `ParallelizationFactor` allows one shard processed by multiple Lambdas in parallel, but partition key-level order guarantee becomes complex.

## Kinesis Data Streams for DynamoDB — Overcome 24-hour Limit

DynamoDB Streams' only major limitation: **24-hour retention**. If 1-year change history is needed, must use Kinesis Data Streams instead.

Connecting DynamoDB table directly to Kinesis Data Streams flows all changes into Kinesis stream. Kinesis supports up to **365-day** retention.

```
DynamoDB Table
    ↓ (Direct connection, no code)
Kinesis Data Stream
    ↓ (Max 365-day retention)
    ├── Lambda (real-time processing)
    ├── Kinesis Firehose → S3 (long-term storage)
    └── Kinesis Analytics (real-time analysis)
```

Exam scenario: "Must retain DynamoDB change history 1+ year" → Kinesis Data Streams for DynamoDB.

## Global Tables — Multi-Region Active-Active

Global Tables creates replicas of DynamoDB table across regions where read/write is possible in each region (Active-Active pattern).

```
ap-northeast-2 table ←→ us-east-1 table ←→ eu-west-1 table
(Write in Seoul)        (Write in Virginia)  (Write in Ireland)
        ↕ Async replication (Streams-based)
All regions eventually consistent synchronization
```

Global Tables requirements: ① DynamoDB Streams enabled mandatory, ② On-demand or equal provisioning capacity.

Conflict resolution: Simultaneous modification of same item in two regions resolved via **Last Writer Wins** method. Latest timestamp write becomes final value.

> ⚠️ **Trap**: Requesting Strongly Consistent read in Global Tables only guarantees consistency in current region's local replica. If other region's write hasn't replicated yet, even local Strongly Consistent read doesn't include other region's latest data.

## PITR (Point-In-Time Recovery) — 35-day Rollback Window

PITR restores DynamoDB table to any point within last 35 days.

```
Activation: Enable per table
Restore: Choose specific time in seconds within last 35 days
Target: Restore to new table (doesn't overwrite existing)
Cost: Per GB of stored data additional charge
```

PITR differs from On-Demand Backup. On-Demand Backup creates manual snapshot at specific time, retained indefinitely. PITR is automatic but only restores within 35-day window.

Exam scenario: "Accidentally deleted large data, want yesterday's state" → PITR. "Regulations require 5-year backup retention" → On-Demand Backup + S3 Export.

Today's core — RCU/WCU mathematics appears almost every exam as calculation problems. Don't memorize formulas but understand the principle: "reads are 4KB-based, writes are 1KB-based, ceil for rounding up". DAX is a transparent cache reducing DynamoDB reads to μs, Streams is a change log preserving 24 hours of all changes.

## 📝 연습 문제

**문제 1.** DynamoDB에서 7KB 항목을 강력한 일관성으로 초당 30번 읽는다. 필요한 프로비저닝 RCU는?

A) 30 RCU
B) 60 RCU
C) 90 RCU
D) 120 RCU

**정답: B**
해설: 강력한 일관성 RCU = ceil(항목 크기 / 4KB) × 1 × 초당 요청 수. ceil(7/4) = ceil(1.75) = 2. 2 × 1 × 30 = 60 RCU. 최종 일관성이었다면 30 RCU(절반)였을 것이다. 트랜잭션 읽기였다면 120 RCU(2배)였을 것이다. 항목 크기가 8KB였다면 ceil(8/4)=2로 동일하지만, 9KB였다면 ceil(9/4)=3이 되어 90 RCU가 된다.

---

**문제 2.** DynamoDB에서 3.5KB 항목을 트랜잭션 쓰기로 초당 20번 쓴다. 필요한 WCU는?

A) 20 WCU
B) 80 WCU
C) 140 WCU
D) 160 WCU

**정답: D**
해설: 트랜잭션 쓰기 WCU = ceil(항목 크기 / 1KB) × 2 × 초당 요청 수. ceil(3.5/1) = 4. 4 × 2 × 20 = 160 WCU. 일반 쓰기라면 ceil(3.5/1)×1×20 = 80 WCU였다.

---

**문제 3.** DAX를 사용할 때 강력한 일관성 읽기 요청은 어떻게 처리되는가?

A) DAX 캐시에서 즉시 반환된다
B) DAX가 DynamoDB에 직접 쿼리하여 최신 데이터를 반환한다
C) 오류가 발생한다 (DAX는 강력한 일관성 미지원)
D) 최종 일관성으로 자동 변환되어 캐시에서 반환된다

**정답: B**
해설: DAX는 강력한 일관성 읽기 요청을 캐시에서 처리하지 않는다. `ConsistentRead: true`로 설정된 읽기는 DAX를 통과하여 DynamoDB에 직접 쿼리된다. 이는 캐시가 최신 데이터를 보장할 수 없기 때문이다 — 최근 쓰기가 캐시에 반영되기 전에 읽을 경우 오래된 데이터를 반환할 수 있다. 강력한 일관성이 필요한 경우 DAX의 성능 혜택을 받지 못한다는 단점이 있다.

---

**문제 4.** DynamoDB Streams를 Lambda와 연동할 때 순서 보장은 어떻게 이루어지는가?

A) 테이블 전체 수준에서 모든 이벤트의 순서가 보장된다
B) 파티션 키 단위로 이벤트 순서가 보장된다
C) 순서 보장이 전혀 없다
D) Lambda가 처리하는 순서와 DynamoDB 이벤트 순서는 무관하다

**정답: B**
해설: DynamoDB Streams는 파티션 키 단위로 이벤트 순서를 보장한다. 같은 파티션 키(같은 항목)에 대한 변경은 발생 순서대로 Stream 샤드에 기록되고, Lambda는 이 순서대로 처리한다. 하지만 서로 다른 파티션 키에 대한 이벤트 간의 순서는 보장되지 않는다. 테이블 전체 수준의 전역 순서 보장은 없다. 이것이 Streams를 통한 데이터 처리에서 상태를 파티션 키 단위로 관리해야 하는 이유다.

---

**문제 5.** DynamoDB 변경 이력을 2년 동안 보존하고 분석해야 한다. 가장 적합한 아키텍처는?

A) DynamoDB Streams + Lambda로 S3에 직접 저장
B) DynamoDB Kinesis Data Streams 연동 → Kinesis Firehose → S3
C) DynamoDB PITR로 35일 백업 보존
D) DynamoDB On-Demand Backup을 매일 수동으로 생성

**정답: B**
해설: DynamoDB Streams는 24시간만 보존하므로 2년 보존에 부적합하다. Kinesis Data Streams는 최대 365일 보존이 가능하지만 2년에는 부족하다. 그러나 Kinesis Firehose를 통해 S3에 영구 저장하면 2년 이상 보존이 가능하다. DynamoDB 테이블을 Kinesis Data Streams에 직접 연결하고, Kinesis Firehose가 S3에 배치로 저장한다. PITR은 35일 한도, On-Demand Backup은 분석에 적합하지 않다.

---

**문제 6.** DynamoDB 테이블에서 온디맨드 모드로 전환한 직후 트래픽이 갑자기 20배 증가했다. 어떤 현상이 발생하는가?

A) 온디맨드는 무한 확장이므로 문제없이 처리된다
B) throttling이 발생한다 — 온디맨드는 이전 피크의 2배까지만 즉시 대응 가능
C) 자동으로 프로비저닝 모드로 전환된다
D) 오류 없이 처리되지만 비용이 20배 청구된다

**정답: B**
해설: 온디맨드 모드는 "무한 확장"이 아니다. 이전에 처리한 트래픽 피크의 2배까지만 즉시 대응한다. 신규 테이블이거나 오랫동안 낮은 트래픽이었다면 최소값에서 시작하므로 갑작스러운 트래픽 급증에서 throttling이 발생한다. 이를 방지하려면 ① 프로비저닝 모드로 충분한 트래픽을 처리한 후 온디맨드로 전환하거나, ② 프로비저닝 모드에서 Auto Scaling으로 점진적으로 확장하는 방법을 사용한다.

---
