# Day 4 - DynamoDB: 트랜잭션, 조건부 쓰기, TTL의 내부 동작

DynamoDB가 "NoSQL은 트랜잭션이 없다"는 편견을 깬 것은 2018년 11월이었다. 그 이전까지는 금융 시스템이나 재고 관리처럼 ACID가 필요한 워크로드에 DynamoDB를 쓰려면 애플리케이션 레이어에서 복잡한 분산 락을 직접 구현해야 했다. TransactWriteItems API 출시로 여러 테이블에 걸친 원자적 쓰기가 가능해지면서 그 벽이 사라졌다. 그러나 트랜잭션을 무작정 쓰면 비용이 정확히 2배가 되고, 조건부 쓰기의 멱등성 특성을 모르면 네트워크 재시도가 데이터 중복을 만든다. 이 day에서는 DynamoDB 트랜잭션의 2단계 커밋 내부 동작, 조건부 쓰기로 경쟁 조건을 방지하는 패턴, TTL이 비동기로 삭제하는 이유와 그 함의를 깊이 파고든다.

## DynamoDB 트랜잭션의 2PC 내부 동작

DynamoDB 트랜잭션은 분산 데이터베이스 이론의 **2단계 커밋(2-Phase Commit, 2PC)** 프로토콜을 기반으로 구현된다. 2PC는 짐 그레이(Jim Gray)가 1970년대에 형식화한 알고리즘으로, 분산 시스템에서 원자적 커밋을 보장하는 표준 방법이다.

1단계(Prepare): 트랜잭션에 포함된 모든 항목에 잠금을 걸고, 모든 조건을 검사한다. 하나라도 실패하면 전체 롤백.
2단계(Commit): 모든 항목의 조건이 만족됐을 때 실제 변경을 적용하고 잠금 해제.

이 2단계 과정 때문에 트랜잭션은 일반 쓰기의 **2배 WCU**를 소비한다 — Prepare 단계와 Commit 단계 각각 용량이 필요하다.

```python
import boto3

dynamodb = boto3.client('dynamodb')

# TransactWriteItems: 여러 테이블 원자적 쓰기
response = dynamodb.transact_write_items(
    TransactItems=[
        # 1. 주문 테이블에 새 주문 추가
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
        # 2. 재고 테이블에서 수량 감소 (0 이상인 경우만)
        {
            'Update': {
                'TableName': 'Inventory',
                'Key': {'productId': {'S': 'P001'}},
                'UpdateExpression': 'SET quantity = quantity - :qty',
                'ConditionExpression': 'quantity >= :qty',
                'ExpressionAttributeValues': {':qty': {'N': '1'}}
            }
        },
        # 3. 다른 테이블의 조건만 확인 (쓰기 없음)
        {
            'ConditionCheck': {
                'TableName': 'Users',
                'Key': {'userId': {'S': 'U001'}},
                'ConditionExpression': 'attribute_exists(userId) AND accountStatus = :active',
                'ExpressionAttributeValues': {':active': {'S': 'ACTIVE'}}
            }
        }
    ],
    # 멱등성 키: 같은 토큰으로 재시도 시 중복 실행 방지 (10분 유효)
    ClientRequestToken='unique-tx-id-2026-06-26-001'
)
```

트랜잭션 API 4가지 액션:
- `Put`: 항목 생성 또는 완전 교체 (ConditionExpression 포함 가능)
- `Update`: 항목 부분 수정 (ConditionExpression 포함 가능)
- `Delete`: 항목 삭제 (ConditionExpression 포함 가능)
- `ConditionCheck`: 쓰기 없이 다른 테이블의 조건만 확인

| API | 원자성 | 최대 항목 | 최대 크기 | 비용 |
|-----|-------|---------|---------|------|
| TransactWriteItems | ✅ ACID | 100개 | 4MB | 2× WCU |
| TransactGetItems | ✅ ACID | 100개 | 4MB | 2× RCU |
| BatchWriteItem | ❌ 원자성 없음 | 25개 | 16MB | 1× WCU |
| BatchGetItem | ❌ 원자성 없음 | 100개 | 16MB | 1× RCU |

> 💡 **관련 이론**: 2PC는 코디네이터(Coordinator)와 참여자(Participant) 모델을 사용한다. DynamoDB 내부에서 코디네이터는 트랜잭션 요청을 받아 각 파티션 스토리지(참여자)에게 Prepare 메시지를 보낸다. 모든 참여자가 "준비됐다"고 응답하면 Commit을 전파한다. 하나라도 실패하면 Abort를 전파한다. 2PC의 고전적 약점은 코디네이터 장애 시 참여자들이 락을 보유한 채로 대기하는 블로킹 문제다. DynamoDB는 내부적으로 조정 레이어를 다중화해 이 문제를 완화한다.

> ⚠️ **함정**: BatchWriteItem은 원자적이지 않다. 25개 중 일부는 성공하고 일부는 실패할 수 있다. 실패한 항목은 `UnprocessedItems`에 담겨 반환된다. 개발자가 직접 `UnprocessedItems`를 처리하는 재시도 로직을 구현해야 한다. 원자성이 필요하면 반드시 TransactWriteItems를 사용해야 한다.

## 트랜잭션 격리 수준 — Serializable

DynamoDB 트랜잭션은 ANSI SQL의 격리 수준 중 가장 강한 **Serializable**을 보장한다. 트랜잭션이 실행되는 동안 다른 트랜잭션이나 개별 쓰기가 해당 항목을 변경할 수 없다.

```
격리 수준 비교 (약 → 강):
Read Uncommitted → Read Committed → Repeatable Read → Serializable

DynamoDB 트랜잭션: Serializable
DynamoDB 개별 Put/Update: 항목 수준 원자성 (단일 항목)
DynamoDB Batch: 원자성 없음
```

트랜잭션 충돌 시 `TransactionConflictException`이 발생한다. 동일한 항목에 대해 두 트랜잭션이 동시에 Prepare 단계에 들어가면 하나가 양보하고 재시도해야 한다.

> 💡 **관련 이론**: Serializable 격리는 이론적으로 모든 트랜잭션이 순차적으로 실행된 것과 동일한 결과를 보장한다(직렬화 가능성, Serializability). 실제로는 병렬 실행되지만 충돌 감지와 롤백으로 이 속성을 유지한다. PostgreSQL은 SSI(Serializable Snapshot Isolation)로 이를 구현하고, DynamoDB는 2PC로 구현한다. 두 방법 모두 충돌이 적은 상황에서 높은 처리량을 유지하면서 격리를 보장한다.

## 조건부 쓰기 패턴 — 경쟁 조건 방지의 핵심

조건부 쓰기는 ConditionExpression이 true일 때만 쓰기를 실행한다. 조건 불만족 시 `ConditionalCheckFailedException`이 발생하고 아무것도 변경되지 않는다.

**패턴 1: 중복 방지 (Upsert Guard)**
```python
# 같은 orderId로 두 번 주문이 들어오는 것을 방지
table.put_item(
    Item={'orderId': 'O001', 'total': 50000},
    ConditionExpression='attribute_not_exists(orderId)'
    # orderId 속성이 없을 때만 삽입 (이미 있으면 예외 발생)
)
```

**패턴 2: 재고 음수 방지**
```python
# 재고가 충분할 때만 차감
table.update_item(
    Key={'productId': 'P001'},
    UpdateExpression='SET quantity = quantity - :qty',
    ConditionExpression='quantity >= :qty',
    ExpressionAttributeValues={':qty': {'N': '1'}}
)
```

**패턴 3: Optimistic Locking (낙관적 잠금)**
```python
# 버전 번호로 동시 수정 충돌 감지
def update_with_optimistic_lock(table, product_id, new_price, current_version):
    try:
        table.update_item(
            Key={'productId': product_id},
            UpdateExpression='SET price = :p, version = version + :inc',
            ConditionExpression='version = :v',
            ExpressionAttributeValues={
                ':p': new_price,
                ':inc': 1,
                ':v': current_version  # 읽은 버전과 일치해야만 수정
            }
        )
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            # 다른 프로세스가 먼저 수정함 → 최신 데이터 다시 읽고 재시도
            return False
        raise
```

> 💡 **관련 이론**: Optimistic Locking은 비관적 잠금(Pessimistic Locking)과 대조된다. 비관적 잠금은 읽기 시점에 잠금을 획득하고(SELECT FOR UPDATE), 다른 접근을 차단한다. 낙관적 잠금은 "충돌이 거의 없을 것"이라 가정하고 잠금 없이 진행하다가 커밋 시점에 충돌을 감지한다. DynamoDB는 분산 환경에서 전통적인 행 잠금을 지원하지 않으므로, 버전 번호 기반 낙관적 잠금이 유일한 다중 클라이언트 동시성 제어 메커니즘이다. MVCC(Multi-Version Concurrency Control)와 개념적으로 유사하다.

**패턴 4: 선착순 처리 (First-Write-Wins)**
```python
# 쿠폰을 가장 먼저 클레임한 사용자만 성공
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

> 📚 **사례**: 2021년 항공사 좌석 예약 시스템의 이중 예약 사고. 동시에 두 명이 같은 좌석을 예약하는 요청이 들어왔을 때, 애플리케이션이 먼저 좌석 가용 여부를 읽고(GetItem) 그 다음 예약을 쓰는(PutItem) 구조였다. 두 요청이 같은 빈 좌석을 읽은 후 각자 PutItem을 실행하면 마지막에 실행된 쓰기가 이기면서 이중 예약이 발생했다. 해결책은 `attribute_not_exists(bookedBy)` 조건부 쓰기로 하나의 요청만 성공하게 하는 것이다. 이 패턴은 TOCTOU(Time-Of-Check-To-Time-Of-Use) 버그라고 불린다.

## Atomic Counter vs Conditional Increment

Atomic Counter는 조건 없이 항상 값을 증가/감소시키는 패턴이다.

```python
# Atomic Counter — 항상 증가 (멱등성 없음)
table.update_item(
    Key={'pageId': 'home'},
    UpdateExpression='ADD viewCount :inc',
    ExpressionAttributeValues={':inc': {'N': '1'}}
)

# Conditional Increment — 한도 검사 포함
table.update_item(
    Key={'userId': 'U001'},
    UpdateExpression='SET loginCount = loginCount + :inc',
    ConditionExpression='loginCount < :maxLogins',
    ExpressionAttributeValues={':inc': {'N': '1'}, ':maxLogins': {'N': '5'}}
)
```

| 구분 | Atomic Counter | Conditional Increment |
|------|--------------|---------------------|
| 멱등성 | ❌ (재시도 시 중복 증가) | ✅ (조건으로 제어) |
| 사용 사례 | 페이지 뷰, 방문자 수 | 일일 로그인 횟수, 재고 |
| 동시성 처리 | DynamoDB가 자동 | ConditionalCheckFailedException으로 처리 |
| 비용 | 저렴 (조건 없음) | 약간 더 비쌈 |

멱등성이 중요한 경우 — 결제 처리에서 네트워크 오류로 재시도가 발생할 때 카운터가 두 번 증가하면 안 된다. 이럴 때는 `ClientRequestToken`으로 트랜잭션 멱등성을 보장하거나, DynamoDB에 별도 idempotency key 테이블을 만들어 중복 처리를 방지한다.

> 🔍 **더 깊이**: `ADD` 연산자는 숫자와 집합(Set) 타입에만 적용된다. 숫자 속성이 없으면 0에서 시작하고, Set 속성이 없으면 빈 집합에서 시작한다. Atomic Counter를 람다에서 사용할 때 Lambda가 재시도되면 카운터가 두 번 증가할 수 있다는 사실을 명심해야 한다. Lambda는 at-least-once 실행 보장이므로, 멱등해야 하는 연산에 Atomic Counter를 쓰면 안 된다.

## TTL의 내부 동작 — 비동기 삭제의 함의

TTL(Time-To-Live)은 Unix epoch 초 단위의 타임스탬프 속성을 가진 항목을 자동으로 삭제한다.

```python
import time

# TTL 속성 추가: 24시간 후 만료
expiry_time = int(time.time()) + 86400  # 현재 시간 + 24시간

table.put_item(
    Item={
        'sessionId': 'S001',
        'userId': 'U001',
        'data': '...',
        'ttl': expiry_time  # 이 속성명은 테이블 TTL 설정에서 지정
    }
)
```

TTL의 중요한 동작 특성들:

**비동기 삭제**: TTL이 만료됐다고 즉시 삭제되지 않는다. AWS 백그라운드 프로세스가 **0~48시간** 내에 비동기로 삭제한다. 이 기간 동안 만료된 항목이 조회될 수 있다.

```python
# 만료된 항목 필터링이 필요한 경우
import time

response = table.query(
    KeyConditionExpression=Key('userId').eq('U001'),
    FilterExpression=Attr('ttl').gt(int(time.time()))
    # TTL이 현재 시간보다 큰 항목만 (유효한 항목)
)
```

**WCU 소비 없음**: TTL로 인한 삭제는 WCU를 소비하지 않는다. 대규모 세션 데이터 정리에 비용 효율적이다.

**Streams에 기록**: TTL 삭제는 DynamoDB Streams에 REMOVE 이벤트로 기록된다. 이때 `userIdentity`가 `{"type": "Service", "principalId": "dynamodb.amazonaws.com"}`로 표시돼 TTL에 의한 삭제임을 식별할 수 있다.

**epoch 초 단위만 지원**: 문자열 날짜나 밀리초 타임스탬프는 TTL로 동작하지 않는다. 반드시 Unix epoch 초 단위의 숫자여야 한다.

> ⚠️ **함정**: TTL 만료 후에도 최대 48시간 동안 항목이 조회될 수 있다. "TTL이 지났으면 데이터가 없을 것"이라고 가정하는 코드는 잘못된 동작을 한다. 특히 TTL을 보안 세션 만료에 사용할 때 위험하다 — 세션이 "만료됐다"고 TTL을 설정해도 48시간 동안 해당 세션이 여전히 유효한 것처럼 조회될 수 있다. 애플리케이션에서 TTL 속성 값을 직접 확인하는 필터링 로직이 반드시 필요하다.

> 🔍 **더 깊이**: TTL 비동기 삭제의 이유는 DynamoDB의 스토리지 아키텍처에 있다. DynamoDB는 데이터를 SSD 기반 분산 스토리지에 저장하는데, TTL 만료 시 즉시 삭제하면 해당 파티션에 일시적 쓰기 부하가 집중된다. 대신 AWS는 백그라운드 가비지 컬렉션 프로세스를 분산해서 실행하므로, 전체 클러스터 부하가 급증하지 않는다. 이는 Java GC의 Stop-the-World를 피하기 위한 Incremental GC와 유사한 트레이드오프다.

## 분산 락 구현 패턴 — DynamoDB로 Redis 없이

DynamoDB의 조건부 쓰기와 TTL을 조합하면 분산 락을 구현할 수 있다.

```python
import time
import uuid

LOCK_TABLE = 'DistributedLocks'
LOCK_TTL_SECONDS = 30  # 락 최대 보유 시간

def acquire_lock(resource_id: str, owner_id: str = None) -> str | None:
    """락 획득. 성공 시 lock_token 반환, 실패 시 None"""
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
            # 락이 없거나 TTL이 만료된 경우에만 획득
            ConditionExpression='attribute_not_exists(resourceId)'
        )
        return owner_id
    except dynamodb.exceptions.ConditionalCheckFailedException:
        return None  # 다른 프로세스가 락 보유 중

def release_lock(resource_id: str, owner_id: str) -> bool:
    """내가 보유한 락만 해제"""
    try:
        dynamodb.delete_item(
            TableName=LOCK_TABLE,
            Key={'resourceId': {'S': resource_id}},
            ConditionExpression='ownerId = :owner',
            ExpressionAttributeValues={':owner': {'S': owner_id}}
        )
        return True
    except dynamodb.exceptions.ConditionalCheckFailedException:
        return False  # 다른 프로세스의 락이거나 이미 만료
```

이 패턴의 핵심은 세 가지다. ① `attribute_not_exists`로 락이 없을 때만 생성, ② TTL로 락 홀더가 죽어도 락이 자동 해제, ③ `ownerId` 조건으로 자기 락만 해제. TTL의 비동기 삭제 때문에 만료 후 최대 48시간 동안 락이 남아있을 수 있다는 점을 감안해 TTL을 넉넉하게 설정해야 한다.

> 📚 **사례**: AWS Lambda를 이용한 결제 처리에서 같은 주문 ID로 두 Lambda 인스턴스가 동시에 실행되는 경우가 있다. Lambda는 at-least-once 실행을 보장하므로 동일한 이벤트가 두 번 처리될 수 있다. DynamoDB 분산 락을 주문 ID로 걸어두면 두 번째 Lambda가 `ConditionalCheckFailedException`을 받고 처리를 포기한다. 이 패턴은 Lambda + SQS + DynamoDB로 구성되는 결제 시스템의 표준 멱등성 패턴으로 AWS Well-Architected Framework에도 언급된다.

## 실무 동시성 패턴 모음

| 시나리오 | 해결책 |
|---------|--------|
| 같은 orderId 중복 주문 방지 | Put + `attribute_not_exists(orderId)` |
| 재고가 0 미만으로 감소 방지 | Update + `quantity >= :qty` |
| 동시 수정 시 데이터 충돌 방지 | Optimistic Locking (version 속성) |
| 쿠폰 선착순 처리 | Update + `attribute_not_exists(claimedBy)` |
| 멱등한 결제 처리 | TransactWrite + ClientRequestToken |
| 여러 테이블 원자적 업데이트 | TransactWriteItems |
| 세션 자동 만료 | TTL 속성 설정 |
| 분산 락 구현 | Conditional Put + TTL (잠금 만료) |

> 🔍 **더 깊이**: DynamoDB 조건부 표현식에서 사용할 수 있는 함수들: `attribute_exists(path)`, `attribute_not_exists(path)`, `attribute_type(path, type)`, `begins_with(path, substr)`, `contains(path, operand)`, `size(path)`. 이 함수들을 AND/OR/NOT으로 조합할 수 있다. 예를 들어 `attribute_exists(userId) AND size(tags) < :maxTags`처럼 복합 조건을 만들 수 있다. 시험에서는 이 함수 중 어느 것이 올바른 조건인지를 고르는 문제가 종종 나온다.

## 다른 클라우드 비교 — 트랜잭션 지원 현황

| 서비스 | 트랜잭션 지원 | 격리 수준 | 최대 항목 |
|--------|------------|---------|---------|
| DynamoDB TransactWrite | ✅ (2018.11~) | Serializable | 100개, 4MB |
| Azure Cosmos DB | ✅ (Stored Procedure 기반) | Snapshot | 배치 100개 |
| Google Bigtable | ❌ | 행 단위 원자성만 | - |
| Google Firestore | ✅ | Serializable | 500개 |
| MongoDB | ✅ (4.0~) | Snapshot | 제한 없음 (실용적 한도 존재) |

> 💡 **관련 이론**: CAP 정리(Brewer, 2000) 관점에서 DynamoDB 트랜잭션은 흥미롭다. 일반 DynamoDB 연산은 AP(Availability + Partition tolerance)를 선택하고 Consistency를 희생한다(최종 일관성). 그러나 트랜잭션은 CP(Consistency + Partition tolerance)에 가깝게 동작하며, 충돌 시 Availability를 희생한다(TransactionConflictException). 같은 시스템에서 두 모드를 선택적으로 사용할 수 있다는 점이 DynamoDB의 설계 유연성을 보여준다.

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

**문제 3.** DynamoDB TTL에 대한 올바른 설명은? (모두 선택)

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
