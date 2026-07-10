# Day 4 - DynamoDB: Transactions, Conditional Writes, and TTL Internal Workings

DynamoDB broke the "NoSQL has no transactions" assumption in November 2018. Before that, workloads needing ACID like financial systems or inventory management had to implement complex distributed locks manually at the application layer. The TransactWriteItems API launch enabled atomic writes across multiple tables, breaking that barrier. However, using transactions blindly doubles costs exactly, and not understanding conditional write idempotence means network retries create data duplication. In this day, we dig deep into the 2-phase commit internal workings of DynamoDB transactions, patterns preventing race conditions with conditional writes, and why TTL deletes asynchronously and its implications.

## DynamoDB Transaction 2PC Internal Workings

DynamoDB transactions implement the **2-Phase Commit (2PC)** protocol from distributed database theory. 2PC is an algorithm formalized by Jim Gray in the 1970s — the standard method ensuring atomic commits in distributed systems.

Phase 1 (Prepare): Lock all items in transaction, check all conditions. If even one fails, rollback entire transaction.
Phase 2 (Commit): Apply actual changes and release locks when all conditions satisfied.

Because of this 2-phase process, transactions consume **2× WCU** of standard writes — both Prepare and Commit phases need capacity.

```python
import boto3

dynamodb = boto3.client('dynamodb')

# TransactWriteItems: Atomic write across multiple tables
response = dynamodb.transact_write_items(
    TransactItems=[
        # 1. Add new order to Orders table
        {
            'Put': {
                'TableName': 'Orders',
                'Item': {
                    'orderId': {'S': 'O001'},
                    'userId': {'S': 'U001'},
                    'total': {'N': '50000'},
                    'status': {'S': 'PENDING'}
                },
                'ConditionExpression': 'attribute_not_exists(orderId)'
            }
        },
        # 2. Reduce inventory (only if quantity >= 1)
        {
            'Update': {
                'TableName': 'Inventory',
                'Key': {'productId': {'S': 'P001'}},
                'UpdateExpression': 'SET quantity = quantity - :qty',
                'ConditionExpression': 'quantity >= :qty',
                'ExpressionAttributeValues': {':qty': {'N': '1'}}
            }
        },
        # 3. Condition-only check on different table (no write)
        {
            'ConditionCheck': {
                'TableName': 'Users',
                'Key': {'userId': {'S': 'U001'}},
                'ConditionExpression': 'attribute_exists(userId) AND accountStatus = :active',
                'ExpressionAttributeValues': {':active': {'S': 'ACTIVE'}}
            }
        }
    ],
    # Idempotency token: same token on retry prevents duplicate execution (10min valid)
    ClientRequestToken='unique-tx-id-2026-06-26-001'
)
```

4 transaction API actions:
- `Put`: Create or completely replace item (can include ConditionExpression)
- `Update`: Partially modify item (can include ConditionExpression)
- `Delete`: Delete item (can include ConditionExpression)
- `ConditionCheck`: Check conditions on other table without writing

| API | Atomicity | Max items | Max size | Cost |
|-----|-------|---------|---------|------|
| TransactWriteItems | ✅ ACID | 100 items | 4MB | 2× WCU |
| TransactGetItems | ✅ ACID | 100 items | 4MB | 2× RCU |
| BatchWriteItem | ❌ No atomicity | 25 items | 16MB | 1× WCU |
| BatchGetItem | ❌ No atomicity | 100 items | 16MB | 1× RCU |

> 💡 **Related theory**: 2PC uses Coordinator-Participant model. Coordinator receives transaction request, sends Prepare messages to each partition storage (Participants). When all respond "ready", Commit is propagated. If any fails, Abort is propagated. 2PC's classical weakness: coordinator failure leaves Participants blocking while holding locks. DynamoDB internally multiplexes coordination layer to mitigate this.

> ⚠️ **Trap**: BatchWriteItem is not atomic. Some of 25 items can succeed, some fail. Failed items are returned in `UnprocessedItems`. Developer must implement retry logic for `UnprocessedItems`. For atomicity, must use TransactWriteItems.

## Transaction Isolation Level — Serializable

DynamoDB transactions guarantee the strongest ANSI SQL isolation level: **Serializable**. While transaction executes, other transactions or individual writes cannot modify those items.

```
Isolation levels (weak → strong):
Read Uncommitted → Read Committed → Repeatable Read → Serializable

DynamoDB transactions: Serializable
DynamoDB individual Put/Update: Item-level atomicity only
DynamoDB Batch: No atomicity
```

On transaction conflict, `TransactionConflictException` is raised. Two transactions entering Prepare phase simultaneously on same item cause one to yield and retry.

> 💡 **Related theory**: Serializable isolation theoretically guarantees all transactions execute as if sequential (Serializability). Practically runs in parallel but maintains this property through conflict detection and rollback. PostgreSQL implements with SSI (Serializable Snapshot Isolation), DynamoDB with 2PC. Both maintain high throughput with few conflicts while guaranteeing isolation.

## Conditional Write Patterns — The Core of Preventing Race Conditions

Conditional writes execute only when ConditionExpression is true. On condition failure, `ConditionalCheckFailedException` is raised and nothing changes.

**Pattern 1: Prevent Duplicates (Upsert Guard)**
```python
# Prevent duplicate orders with same orderId
table.put_item(
    Item={'orderId': 'O001', 'total': 50000},
    ConditionExpression='attribute_not_exists(orderId)'
    # Insert only if orderId absent (raise exception if exists)
)
```

**Pattern 2: Prevent Negative Inventory**
```python
# Reduce inventory only if sufficient quantity
table.update_item(
    Key={'productId': 'P001'},
    UpdateExpression='SET quantity = quantity - :qty',
    ConditionExpression='quantity >= :qty',
    ExpressionAttributeValues={':qty': {'N': '1'}}
)
```

**Pattern 3: Optimistic Locking**
```python
# Detect concurrent modification conflicts with version number
def update_with_optimistic_lock(table, product_id, new_price, current_version):
    try:
        table.update_item(
            Key={'productId': product_id},
            UpdateExpression='SET price = :p, version = version + :inc',
            ConditionExpression='version = :v',
            ExpressionAttributeValues={
                ':p': new_price,
                ':inc': 1,
                ':v': current_version  # Modify only if version matches
            }
        )
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            # Other process modified first → read latest, retry
            return False
        raise
```

> 💡 **Related theory**: Optimistic Locking contrasts with Pessimistic Locking. Pessimistic acquires lock at read time (SELECT FOR UPDATE), blocks other access. Optimistic assumes "conflicts are rare", proceeds without locks, detects conflicts at commit. DynamoDB doesn't support traditional row locking in distributed environments, so version-based optimistic locking is the only multi-client concurrency control mechanism. Conceptually similar to MVCC (Multi-Version Concurrency Control).

**Pattern 4: First-Write-Wins**
```python
# Only first user to claim coupon succeeds
table.update_item(
    Key={'couponId': 'C001'},
    UpdateExpression='SET claimedBy = :userId, claimedAt = :ts',
    ConditionExpression='attribute_not_exists(claimedBy)',
    ExpressionAttributeValues={
        ':userId': {'S': 'U001'},
        ':ts': {'S': '2026-06-26T10:00:00Z'}
    }
)
```

> 📚 **Case study**: 2021 airline seat reservation system double-booking incident. When two users simultaneously requested same seat, application read seat availability (GetItem), then executed reservation (PutItem). Both requests read the same empty seat, then each executed PutItem — last write wins, causing double-booking. Solution: Use conditional write `attribute_not_exists(bookedBy)` so only one request succeeds. This pattern is called TOCTOU (Time-Of-Check-To-Time-Of-Use) bug.

## Atomic Counter vs Conditional Increment

Atomic Counter always increments/decrements values without conditions.

```python
# Atomic Counter — always increment (not idempotent)
table.update_item(
    Key={'pageId': 'home'},
    UpdateExpression='ADD viewCount :inc',
    ExpressionAttributeValues={':inc': {'N': '1'}}
)

# Conditional Increment — includes limit check
table.update_item(
    Key={'userId': 'U001'},
    UpdateExpression='SET loginCount = loginCount + :inc',
    ConditionExpression='loginCount < :maxLogins',
    ExpressionAttributeValues={':inc': {'N': '1'}, ':maxLogins': {'N': '5'}}
)
```

| Aspect | Atomic Counter | Conditional Increment |
|------|--------------|---------------------|
| Idempotence | ❌ (retry duplicates increment) | ✅ (condition controls) |
| Use cases | Page views, visitor count | Daily login count, inventory |
| Concurrency handling | DynamoDB automatic | ConditionalCheckFailedException handling |
| Cost | Cheaper (no condition) | Slightly more |

Idempotence matters when — payment processing with network error retry shouldn't double-increment counter. Use `ClientRequestToken` for transaction idempotence or create separate idempotency key table in DynamoDB.

> 🔍 **Going deeper**: `ADD` operator applies only to numbers and Set types. Missing number attribute starts at 0; missing Set starts empty. Atomic Counter from Lambda means if Lambda retries, counter increments twice. Lambda guarantees at-least-once execution, so don't use Atomic Counter for operations requiring idempotence.

## TTL Internal Workings — Async Deletion Implications

TTL (Time-To-Live) automatically deletes items with Unix epoch seconds timestamp attribute past expiry.

```python
import time

# Add TTL attribute: expire after 24 hours
expiry_time = int(time.time()) + 86400  # Current time + 24hrs

table.put_item(
    Item={
        'sessionId': 'S001',
        'userId': 'U001',
        'data': '...',
        'ttl': expiry_time  # Attribute name specified in table TTL settings
    }
)
```

Important TTL behavioral characteristics:

**Async deletion**: Expired items are not deleted immediately. AWS background process deletes **asynchronously within 0~48 hours**. Expired items may be retrieved during this window.

```python
# Filtering needed for expired items
import time

response = table.query(
    KeyConditionExpression=Key('userId').eq('U001'),
    FilterExpression=Attr('ttl').gt(int(time.time()))
    # Include only items with TTL > current time (valid items)
)
```

**No WCU consumption**: TTL deletions don't consume WCU. Cost-effective for large session data cleanup.

**Streams recording**: TTL deletion is recorded as REMOVE event in DynamoDB Streams. `userIdentity` shows `{"type": "Service", "principalId": "dynamodb.amazonaws.com"}` to identify TTL deletion.

**Epoch seconds only**: String dates or millisecond timestamps don't work with TTL. Must be Unix epoch seconds as number.

> ⚠️ **Trap**: Items may be retrievable for up to 48 hours after TTL expiry. Code assuming "TTL expired means no data" is incorrect. Especially risky when using TTL for security session expiry — session may be "expired" via TTL but remain queryable for 48 hours, appearing valid. Application must filter TTL values directly.

> 🔍 **Going deeper**: Reason for async TTL deletion is in DynamoDB's storage architecture. Data stored on SSD-based distributed storage; immediate deletion on expiry concentrates write load on that partition. Instead, AWS runs background garbage collection process distributed, preventing sudden cluster load spike. Similar to Java GC's Incremental GC avoiding Stop-the-World.

## Distributed Lock Pattern — DynamoDB Without Redis

Combining DynamoDB conditional writes and TTL enables distributed lock implementation.

```python
import time
import uuid

LOCK_TABLE = 'DistributedLocks'
LOCK_TTL_SECONDS = 30  # Max lock holding time

def acquire_lock(resource_id: str, owner_id: str = None) -> str | None:
    """Acquire lock. Returns lock_token on success, None on failure"""
    if owner_id is None:
        owner_id = str(uuid.uuid4())
    
    try:
        dynamodb.put_item(
            TableName=LOCK_TABLE,
            Item={
                'resourceId': {'S': resource_id},
                'ownerId': {'S': owner_id},
                'ttl': {'N': str(int(time.time()) + LOCK_TTL_SECONDS)}
            },
            # Acquire only if lock absent or TTL expired
            ConditionExpression='attribute_not_exists(resourceId)'
        )
        return owner_id
    except dynamodb.exceptions.ConditionalCheckFailedException:
        return None  # Other process holding lock

def release_lock(resource_id: str, owner_id: str) -> bool:
    """Release only my lock"""
    try:
        dynamodb.delete_item(
            TableName=LOCK_TABLE,
            Key={'resourceId': {'S': resource_id}},
            ConditionExpression='ownerId = :owner',
            ExpressionAttributeValues={':owner': {'S': owner_id}}
        )
        return True
    except dynamodb.exceptions.ConditionalCheckFailedException:
        return False  # Other process's lock or already expired
```

Pattern's three core elements: ① `attribute_not_exists` creates lock only absent, ② TTL auto-releases if lock holder dies, ③ `ownerId` condition ensures only own lock released. TTL async deletion can leave locks for 48 hours post-expiry; set TTL generously considering this.

> 📚 **Case study**: AWS Lambda payment processing where same order ID runs two Lambda instances simultaneously. Lambda guarantees at-least-once execution, so same event processes twice. DynamoDB distributed lock on order ID causes second Lambda to receive `ConditionalCheckFailedException` and abandon processing. This pattern is the standard idempotence pattern for Lambda + SQS + DynamoDB payment systems in AWS Well-Architected Framework.

## Real-World Concurrency Patterns Summary

| Scenario | Solution |
|---------|--------|
| Prevent duplicate orderId | Put + `attribute_not_exists(orderId)` |
| Prevent inventory below 0 | Update + `quantity >= :qty` |
| Prevent concurrent modification conflicts | Optimistic Locking (version attribute) |
| Coupon first-come-first-served | Update + `attribute_not_exists(claimedBy)` |
| Idempotent payment processing | TransactWrite + ClientRequestToken |
| Multi-table atomic updates | TransactWriteItems |
| Session auto-expiry | TTL attribute setting |
| Distributed lock implementation | Conditional Put + TTL (lock expiry) |

> 🔍 **Going deeper**: Functions available in DynamoDB condition expressions: `attribute_exists(path)`, `attribute_not_exists(path)`, `attribute_type(path, type)`, `begins_with(path, substr)`, `contains(path, operand)`, `size(path)`. Combine with AND/OR/NOT. For example: `attribute_exists(userId) AND size(tags) < :maxTags`. Exams often ask which function is correct for given condition.

## Cloud Comparison — Current Transaction Support Status

| Service | Transaction support | Isolation level | Max items |
|--------|------------|---------|---------|
| DynamoDB TransactWrite | ✅ (2018.11~) | Serializable | 100 items, 4MB |
| Azure Cosmos DB | ✅ (Stored Procedure-based) | Snapshot | Batch 100 |
| Google Bigtable | ❌ | Row-level atomicity only | - |
| Google Firestore | ✅ | Serializable | 500 items |
| MongoDB | ✅ (4.0~) | Snapshot | No limit (practical limit exists) |

> 💡 **Related theory**: From CAP Theorem perspective (Brewer, 2000), DynamoDB transactions are interesting. General DynamoDB operations choose AP (Availability + Partition tolerance), sacrificing Consistency (eventual consistency). Transactions behave closer to CP (Consistency + Partition tolerance), sacrificing Availability on conflict (TransactionConflictException). Same system can selectively use both modes — showing DynamoDB's design flexibility.

## 📝 연습 문제

**문제 1.** DynamoDB TransactWriteItems의 최대 항목 수와 비용은?

A) 최대 25개, 1× WCU
B) 최대 100개, 2× WCU
C) 최대 25개, 2× WCU
D) 최대 100개, 1× WCU

**정답: B**
해설: TransactWriteItems는 최대 100개 항목(또는 4MB)을 하나의 트랜잭션으로 처리할 수 있다. 비용은 일반 쓰기의 2배 WCU를 소비한다 — 2단계 커밋(Prepare + Commit)이 필요하기 때문이다. 2023년부터 100개로 확대됐다(이전 25개). BatchWriteItem은 25개 제한, 비용 1× WCU이지만 원자성이 없다.

---

**문제 2.** BatchWriteItem과 TransactWriteItems의 핵심 차이는?

A) BatchWriteItem은 여러 테이블을 지원하지 않는다
B) TransactWriteItems는 원자적이고 All-or-Nothing이지만, BatchWriteItem은 원자성이 없어 일부만 성공할 수 있다
C) BatchWriteItem은 최대 100개, TransactWriteItems는 최대 25개
D) 성능 차이만 있을 뿐 원자성은 동일하다

**정답: B**
해설: 가장 중요한 차이는 원자성이다. TransactWriteItems는 ACID 트랜잭션으로 모든 항목이 성공하거나 모두 실패한다. BatchWriteItem은 원자성이 없어 일부 항목만 성공하고 실패한 항목은 `UnprocessedItems`로 반환된다. BatchWriteItem이 여러 테이블을 지원하는 것은 맞다(A는 틀림). BatchWriteItem은 최대 25개, TransactWriteItems는 최대 100개다(C는 반대로 기술됨).

---

**문제 3.** DynamoDB TTL에 대한 올바른 설명을 모두 고르시오.

A) TTL 삭제는 WCU를 소비하지 않는다
B) TTL이 만료된 항목은 즉시 삭제된다
C) TTL로 삭제된 항목은 DynamoDB Streams에 REMOVE 이벤트로 기록된다
D) TTL 속성값은 Unix epoch 밀리초 단위여야 한다

**정답: A, C**
해설: A(맞음) — TTL 삭제는 WCU를 소비하지 않아 비용 효율적이다. B(틀림) — TTL 만료 후 0~48시간 내 비동기로 삭제되며 즉시 삭제가 아니다. C(맞음) — Streams에 REMOVE 이벤트로 기록되며 `userIdentity`로 TTL 삭제임을 식별할 수 있다. D(틀림) — TTL 속성값은 Unix epoch **초** 단위여야 한다. 밀리초나 문자열은 TTL로 동작하지 않는다.

---

**문제 4.** Optimistic Locking에서 ConditionalCheckFailedException이 발생했을 때 올바른 처리는?

A) 오류를 무시하고 계속 진행한다
B) 최신 데이터를 다시 읽고 비즈니스 로직을 재적용한 후 재시도한다
C) 트랜잭션으로 전환한다
D) 테이블을 재생성한다

**정답: B**
해설: ConditionalCheckFailedException은 버전 번호가 일치하지 않아 다른 프로세스가 먼저 항목을 수정했음을 의미한다. 올바른 처리는 최신 데이터를 다시 읽고(GetItem), 변경사항을 새 버전에 적용한 후 재시도하는 것이다. 이 재시도 로직을 구현할 때 최대 재시도 횟수와 지수 백오프(exponential backoff)를 포함해야 한다. 오류를 무시하면 데이터 손실이 발생하고, 무한 재시도는 라이브록(livelock)을 유발할 수 있다.

---

**문제 5.** 전자상거래에서 상품 구매 시 재고 감소와 주문 생성을 동시에 처리해야 한다. 재고가 부족하면 주문도 취소되어야 한다. 가장 적합한 DynamoDB 구현은?

A) 재고 Update → 주문 Put 순서로 별도 API 호출
B) TransactWriteItems로 재고 Update(quantity >= 1 조건)와 주문 Put을 원자적으로 실행
C) Lambda를 두 번 호출해 순차 처리
D) SQS 큐로 비동기 처리

**정답: B**
해설: 재고 감소와 주문 생성이 원자적이어야 한다. 별도 API 호출(A)은 재고 감소 성공 후 주문 생성 실패 시 재고만 감소하는 불일치가 생긴다. TransactWriteItems는 ACID 트랜잭션으로 재고의 `quantity >= 1` 조건이 실패하면 주문 Put도 실행되지 않는다. Lambda 순차 처리(C)도 중간 실패 시 불일치가 생긴다. SQS 비동기(D)는 원자성을 보장하지 않는다.

---

**문제 6.** 분산 락 구현 시 TTL 속성을 함께 설정하는 이유는?

A) 락 소유자를 식별하기 위해
B) 락 홀더 프로세스가 비정상 종료되었을 때 락이 자동으로 해제되도록 하기 위해
C) 락 획득 속도를 높이기 위해
D) WCU 비용을 절감하기 위해

**정답: B**
해설: 분산 락의 가장 큰 위험은 락 홀더가 크래시되거나 네트워크 파티션으로 락을 해제하지 못하는 경우다. TTL을 설정하면 락 홀더가 사라져도 TTL 만료 후 DynamoDB가 자동으로 항목을 삭제해 다른 프로세스가 락을 획득할 수 있다. 다만 TTL 삭제가 비동기(0~48시간)이므로, 락 TTL을 비즈니스 요구 시간보다 충분히 짧게 설정해야 한다.

---

**문제 7.** DynamoDB TransactWriteItems에서 `ClientRequestToken`의 역할은?

A) 트랜잭션 우선순위를 설정한다
B) 같은 토큰으로 재시도할 때 트랜잭션이 중복 실행되지 않도록 멱등성을 보장한다 (10분 유효)
C) 특정 파티션에 트랜잭션을 고정시킨다
D) 트랜잭션 격리 수준을 설정한다

**정답: B**
해설: `ClientRequestToken`은 트랜잭션 멱등성 토큰이다. 네트워크 오류로 트랜잭션 응답을 못 받았을 때, 같은 토큰으로 재시도하면 DynamoDB가 이전 결과를 그대로 반환하고 트랜잭션을 다시 실행하지 않는다. 토큰은 UUID로 생성하고 요청 ID나 주문 ID에서 파생시키는 것이 일반적이다. 10분 유효창 이후 같은 토큰으로 재시도하면 새 트랜잭션으로 처리된다.

---
