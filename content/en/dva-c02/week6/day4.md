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

## 📝 Practice Questions

**Question 1.** What are the maximum number of items and the cost of DynamoDB TransactWriteItems?

A) Up to 25 items, 1x WCU
B) Up to 100 items, 2x WCU
C) Up to 25 items, 2x WCU
D) Up to 100 items, 1x WCU

**Answer: B**
Explanation: TransactWriteItems can process up to 100 items (or 4 MB) in one transaction. The cost consumes 2x the WCU of a standard write — because a two-phase commit (Prepare + Commit) is required. It was expanded to 100 starting in 2023 (previously 25). BatchWriteItem has a 25-item limit and costs 1x WCU, but has no atomicity.

---

**Question 2.** What is the key difference between BatchWriteItem and TransactWriteItems?

A) BatchWriteItem does not support multiple tables
B) TransactWriteItems is atomic and all-or-nothing, but BatchWriteItem has no atomicity, so only some items may succeed
C) BatchWriteItem is up to 100 items, TransactWriteItems is up to 25
D) There is only a performance difference; atomicity is the same

**Answer: B**
Explanation: The most important difference is atomicity. TransactWriteItems is an ACID transaction in which all items succeed or all fail. BatchWriteItem has no atomicity, so only some items may succeed and the failed items are returned as `UnprocessedItems`. It is true that BatchWriteItem supports multiple tables (A is wrong). BatchWriteItem is up to 25 items and TransactWriteItems is up to 100 (C states them in reverse).

---

**Question 3.** Select all correct statements about DynamoDB TTL.

A) TTL deletion does not consume WCUs
B) Items whose TTL has expired are deleted immediately
C) Items deleted by TTL are recorded in DynamoDB Streams as REMOVE events
D) The TTL attribute value must be in Unix epoch milliseconds

**Answer: A, C**
Explanation: A (correct) — TTL deletion does not consume WCUs, so it is cost-efficient. B (incorrect) — Items are deleted asynchronously within 0 to 48 hours after TTL expiration, not immediately. C (correct) — They are recorded in Streams as REMOVE events, and `userIdentity` can be used to identify them as TTL deletions. D (incorrect) — The TTL attribute value must be in Unix epoch **seconds**. Milliseconds or strings do not work as TTL.

---

**Question 4.** What is the correct handling when ConditionalCheckFailedException occurs in Optimistic Locking?

A) Ignore the error and continue
B) Re-read the latest data, reapply the business logic, and retry
C) Switch to a transaction
D) Recreate the table

**Answer: B**
Explanation: ConditionalCheckFailedException means the version numbers did not match, so another process modified the item first. The correct handling is to re-read the latest data (GetItem), apply your changes to the new version, and retry. When implementing this retry logic, include a maximum retry count and exponential backoff. Ignoring the error causes data loss, and infinite retries can cause livelock.

---

**Question 5.** In an e-commerce application, when a product is purchased, inventory reduction and order creation must be processed together. If inventory is insufficient, the order must also be canceled. What is the most suitable DynamoDB implementation?

A) Separate API calls in the order inventory Update -> order Put
B) Atomically execute the inventory Update (with a quantity >= 1 condition) and the order Put with TransactWriteItems
C) Invoke Lambda twice for sequential processing
D) Asynchronous processing with an SQS queue

**Answer: B**
Explanation: Inventory reduction and order creation must be atomic. Separate API calls (A) create an inconsistency where, if order creation fails after inventory reduction succeeds, only the inventory is reduced. TransactWriteItems is an ACID transaction, so if the inventory's `quantity >= 1` condition fails, the order Put is not executed either. Sequential Lambda processing (C) also creates an inconsistency on a mid-way failure. Asynchronous SQS (D) does not guarantee atomicity.

---

**Question 6.** Why is a TTL attribute also set when implementing a distributed lock?

A) To identify the lock owner
B) So that the lock is released automatically when the lock-holding process terminates abnormally
C) To speed up lock acquisition
D) To reduce WCU cost

**Answer: B**
Explanation: The biggest risk of a distributed lock is the case where the lock holder crashes or cannot release the lock because of a network partition. If a TTL is set, even if the lock holder disappears, DynamoDB automatically deletes the item after the TTL expires so that another process can acquire the lock. However, since TTL deletion is asynchronous (0 to 48 hours), the lock TTL must be set sufficiently shorter than the time required by the business requirements.

---

**Question 7.** What is the role of `ClientRequestToken` in DynamoDB TransactWriteItems?

A) It sets the transaction priority
B) It guarantees idempotency so that a transaction is not executed twice when retried with the same token (valid for 10 minutes)
C) It pins the transaction to a specific partition
D) It sets the transaction isolation level

**Answer: B**
Explanation: `ClientRequestToken` is a transaction idempotency token. When you do not receive the transaction response due to a network error, retrying with the same token makes DynamoDB return the previous result as is and not execute the transaction again. The token is typically generated as a UUID and derived from a request ID or order ID. If you retry with the same token after the 10-minute validity window, it is processed as a new transaction.

---
