# Day 2 - DynamoDB: 파티션 키 설계의 수학, LSI/GSI 내부 동작, Single-Table Design

DynamoDB를 처음 배울 때 "파티션 키를 잘 골라야 한다"는 말을 듣지만, "잘 고른다"의 수학적 의미는 잘 가르쳐주지 않는다. 이 day에서는 파티션 키 설계가 왜 수학적 문제인지, LSI와 GSI가 내부적으로 어떻게 다르게 저장되는지, 그리고 수십 개의 마이크로서비스가 사용하던 테이블들을 하나로 합치는 Single-Table Design이 왜 DynamoDB의 표준 패턴인지를 깊이 파고든다.

## 파티션 키 카디널리티의 수학

파티션 키의 "좋은 선택"을 수학으로 정의하면 이렇다: **모든 파티션에 걸쳐 읽기/쓰기 부하가 균등하게 분산되도록 해야 한다**.

이 균등 분산을 측정하는 지표가 카디널리티(Cardinality)와 편향도(Skewness)다.

```
카디널리티 계산:
  userId(UUID): 수백만 고유 값 → 수백만 파티션 가능 → 좋음
  status: 3~5개 값 → 최대 5개 파티션 → 핫 파티션 위험
  날짜: 수천 개 값이지만 오늘 날짜에 쓰기 집중 → 시간적 편향

편향도가 중요한 이유:
  파티션 A: 초당 쓰기 900건 (한도 1,000 WCU에 근접)
  파티션 B: 초당 쓰기 10건
  파티션 C: 초당 쓰기 5건

  테이블 총 WCU = 915/s로 한도 여유가 있어도
  파티션 A에서만 throttling 발생 → Adaptive Capacity가 완화
  하지만 편향이 극심하면 AC도 한계
```

실무에서 핫 파티션을 해결하는 기법: **파티션 키에 샤드 번호 추가(Write Sharding)**

```python
import random

def get_sharded_pk(base_pk: str, shard_count: int = 10) -> str:
    """파티션 키에 랜덤 샤드 번호를 붙여 분산"""
    shard = random.randint(0, shard_count - 1)
    return f"{base_pk}#{shard}"

# 날짜 기반 PK 분산 예시
date_key = "2026-06-26"
sharded_key = get_sharded_pk(date_key, 10)
# → "2026-06-26#7" 또는 "2026-06-26#3" 등 10개 파티션에 분산

# 조회 시: 모든 샤드를 병렬로 쿼리 (Scatter-Gather)
def query_all_shards(date: str, shard_count: int = 10):
    results = []
    for shard in range(shard_count):
        pk = f"{date}#{shard}"
        results.extend(query_partition(pk))
    return results
```

Write Sharding의 단점은 읽기 시 **Scatter-Gather** 패턴이 필요하다는 것이다 — 모든 샤드를 쿼리한 후 결과를 합쳐야 한다. 읽기 복잡도가 증가하므로 "핫 파티션이 심각한 쓰기 집중 시나리오"에서만 사용한다.

> 💡 **관련 이론**: Write Sharding은 분산 데이터베이스 이론에서 "horizontal partitioning"의 응용이다. Cassandra의 "wide partitions" 문제를 해결하는 방법과 동일한 원리다. 샤드 수(Fan-out Factor)는 예상 피크 WCU / 파티션당 WCU 한도(1,000)로 계산한다. 피크 WCU가 8,000이면 최소 8개 샤드가 필요하다. 10개로 잡으면 여유분이 생긴다.

## LSI vs GSI — 내부 저장 방식의 근본적 차이

LSI와 GSI는 둘 다 "보조 인덱스"지만 내부 구현이 완전히 다르다.

**LSI(Local Secondary Index)**: "로컬"이라는 이름이 의미하듯, 기본 테이블의 **같은 파티션 안에** 인덱스 데이터가 저장된다. 기본 테이블의 파티션 키를 그대로 사용하면서 정렬 키만 바꾸는 것이다.

```
기본 테이블 파티션:
userId=U001 파티션
  ├── Item(orderId=O001, orderDate=2026-01, status=PENDING, total=50000)
  ├── Item(orderId=O002, orderDate=2026-02, status=COMPLETED, total=30000)
  └── Item(orderId=O003, orderDate=2026-01, status=COMPLETED, total=80000)

LSI(PK=userId, SK=orderDate 대신):
같은 파티션 내에 추가 인덱스 구조만 생성
  ├── Item(orderDate=2026-01, orderId=O001, ...) ← 정렬 키만 변경
  ├── Item(orderDate=2026-01, orderId=O003, ...)
  └── Item(orderDate=2026-02, orderId=O002, ...)
```

LSI는 기본 테이블과 같은 파티션에 있으므로:
- **강력한 일관성 읽기 지원** (같은 노드에서 읽기 가능)
- **별도 RCU/WCU 불필요** (기본 테이블 용량 공유)
- **테이블 생성 시에만 정의 가능** (이후 추가/삭제 불가)
- **단일 파티션 항목 컬렉션 10GB 제한** (PK 기준으로 합산)

**GSI(Global Secondary Index)**: "글로벌"이라는 이름이 의미하듯, 기본 테이블과 **완전히 별도의 파티션에** 인덱스 데이터가 저장된다. 기본 테이블의 파티션 키와 다른 속성을 GSI 파티션 키로 사용할 수 있다.

```
기본 테이블:
PK=userId, SK=orderId로 파티션됨

GSI(PK=status):
완전히 별도 파티션에 저장
  status=PENDING 파티션: O001, O005, O008
  status=COMPLETED 파티션: O002, O003, O007
  status=FAILED 파티션: O004, O006

이 데이터는 기본 테이블과 비동기적으로 동기화됨
```

GSI는 별도 파티션이므로:
- **최종 일관성 읽기만** (비동기 복제 때문)
- **별도 RCU/WCU 필요** (독립적인 파티션)
- **언제든 추가/삭제 가능**
- **Projection 설정** (KEYS_ONLY, INCLUDE, ALL)

| 특성 | LSI | GSI |
|------|-----|-----|
| 파티션 키 | 기본 테이블과 동일 | 다른 속성 가능 |
| 정렬 키 | 다른 속성 | 다른 속성 |
| 저장 위치 | 기본 파티션 내부 | 별도 파티션 |
| 생성 시점 | 테이블 생성 시만 | 언제든 |
| 일관성 | 강력한 일관성 지원 | 최종 일관성만 |
| 용량 | 기본 테이블 공유 | 별도 설정 |
| 최대 개수 | 5개 | 20개 |
| 항목 컬렉션 한도 | 10GB (PK 기준) | 해당 없음 |

> 🔍 **더 깊이**: GSI의 비동기 복제 지연은 일반적으로 밀리초 수준이지만, 테이블에 쓰기 부하가 높거나 GSI WCU가 부족하면 수 초까지 늘어날 수 있다. 특히 GSI WCU가 기본 테이블 WCU보다 낮으면 GSI가 쓰기를 따라가지 못해 지연이 증가한다. 심각한 경우 기본 테이블 쓰기 자체가 throttling된다 — 이것이 "GSI WCU ≥ 기본 테이블 WCU"를 유지해야 하는 이유다.

## GSI Throttling — 가장 자주 보는 DynamoDB 함정

GSI WCU가 기본 테이블 WCU보다 낮을 때 발생하는 연쇄 문제:

```
[시나리오]
기본 테이블 WCU: 1,000
GSI WCU: 100 (너무 낮음)

기본 테이블 쓰기 속도: 800 WCU/s
  → 기본 테이블: 정상 (800 < 1000)
  → GSI 복제: 800 WCU/s 필요하지만 100 WCU만 가능
  → GSI throttling 발생
  → 연쇄 효과: 기본 테이블 쓰기도 throttling!

해결책:
1. GSI WCU를 기본 테이블과 동일하게 설정
2. 온디맨드 모드로 변경 (자동 확장)
3. 불필요한 GSI 제거
```

온디맨드 모드로 테이블을 설정하면 GSI도 자동으로 온디맨드가 되므로 WCU 불일치 문제가 해결된다. 프로비저닝 모드에서는 GSI WCU를 항상 기본 테이블 WCU 이상으로 유지해야 한다.

> ⚠️ **함정**: 많은 개발자가 기본 테이블 WCU는 충분히 잡지만 GSI WCU를 기본 테이블의 절반 정도로 설정한다. 이것이 "무작위로 발생하는" throttling의 원인인 경우가 많다.

## GSI Projection — 인덱스에 어떤 속성을 저장할까

GSI를 만들 때 기본 테이블의 어떤 속성을 인덱스에 포함할지(Projection) 결정해야 한다.

| Projection 유형 | 인덱스에 저장 | 스토리지 비용 | 추가 조회 필요 |
|---------------|-------------|------------|-------------|
| KEYS_ONLY | 기본 테이블 PK + GSI PK/SK만 | 최저 | 모든 속성 필요 시 GetItem 필요 |
| INCLUDE | 지정한 속성 + 키 | 중간 | 미지정 속성 필요 시 GetItem 필요 |
| ALL | 모든 속성 | 최고 | 추가 조회 불필요 |

실무 패턴: KEYS_ONLY로 GSI를 만들고, GSI 쿼리 결과의 기본 키를 수집한 후 BatchGetItem으로 필요한 속성을 한 번에 가져오는 패턴. GSI 스토리지 비용이 최소화되고, BatchGetItem으로 100개까지 한 번에 가져올 수 있어 효율적이다.

```python
# KEYS_ONLY GSI 패턴
def get_pending_orders(status: str) -> list:
    # 1. GSI 쿼리 (키만 반환)
    gsi_result = table.query(
        IndexName='StatusIndex',
        KeyConditionExpression=Key('status').eq(status)
    )
    
    # 2. 기본 키 목록 수집
    keys = [{'PK': {'S': item['PK']}, 'SK': {'S': item['SK']}} 
            for item in gsi_result['Items']]
    
    # 3. BatchGetItem으로 전체 속성 조회
    response = dynamodb.batch_get_item(
        RequestItems={
            'OrdersTable': {
                'Keys': keys,
                'ProjectionExpression': 'orderId, userId, total, createdAt'
            }
        }
    )
    return response['Responses']['OrdersTable']
```

## Single-Table Design — DynamoDB의 표준 패턴

관계형 DB에서 개발자는 보통 엔티티별로 테이블을 만든다 — Users 테이블, Orders 테이블, Products 테이블. DynamoDB에서 이 방식을 그대로 따르면 성능 문제가 생긴다.

예를 들어 "특정 사용자의 최근 주문 10개와 사용자 프로필"을 한 화면에 보여줄 때:
- 멀티테이블 방식: GetItem(Users) + Query(Orders) = 2번의 네트워크 왕복
- 단일 테이블 방식: Query(단일 테이블) = 1번의 네트워크 왕복

DynamoDB 내부의 Werner Vogels팀과 Rick Houlihan이 수년에 걸쳐 정립한 것이 Single-Table Design이다.

```
[Single-Table Design 예시: 전자상거래]

테이블 이름: ECommerceTable

PK            | SK              | 속성들
--------------|-----------------|---------------------------------
USER#U001     | PROFILE         | name, email, phone, createdAt
USER#U001     | ORDER#2026-01#O001 | orderId, total, status, items
USER#U001     | ORDER#2026-02#O002 | orderId, total, status, items
USER#U001     | REVIEW#P001     | rating, text, createdAt
PRODUCT#P001  | DETAIL          | name, price, category, stock
PRODUCT#P001  | REVIEW#U001     | rating, text
PRODUCT#P001  | REVIEW#U002     | rating, text
ORDER#O001    | STATUS          | status, updatedAt

[자주 사용하는 쿼리 패턴]
1. 사용자 프로필 + 주문 내역:
   Query(PK=USER#U001) → 프로필, 주문, 리뷰 모두 반환

2. 사용자의 최신 주문만:
   Query(PK=USER#U001, SK begins_with("ORDER#"), ScanIndexForward=false, Limit=10)

3. 특정 주문의 상태:
   GetItem(PK=ORDER#O001, SK=STATUS)

4. 상품별 리뷰 목록:
   Query(PK=PRODUCT#P001, SK begins_with("REVIEW#"))
```

> 💡 **관련 이론**: Single-Table Design은 RDBMS의 정규화(Normalization)와 반대되는 역정규화(Denormalization) 전략이다. 정규화는 데이터 중복을 줄이고 일관성을 높이지만 JOIN이 필요하다. 역정규화는 데이터 중복을 허용하지만 JOIN 없이 빠른 조회가 가능하다. DynamoDB는 JOIN 자체가 없으므로 역정규화가 필수다. 이 설계 철학은 Google의 Bigtable 논문(2006)에서도 동일하게 나타나며, "store data how you use it"이라는 원칙으로 요약된다.

## Sparse Index — 조건부 GSI 인덱싱

Sparse Index는 특정 속성을 가진 항목만 GSI에 포함되게 하는 고급 패턴이다.

```
User 항목들:
  User#001: {isAdmin: true, email: "admin@example.com"}
  User#002: {email: "user@example.com"}  ← isAdmin 속성 없음
  User#003: {isAdmin: true, email: "admin2@example.com"}

GSI PK = isAdmin

GSI에 포함되는 항목:
  isAdmin=true → User#001, User#003 (isAdmin 없는 항목은 GSI에 없음)

"관리자만 조회" 쿼리:
  Query(GSI, PK=isAdmin, value=true) → User#001, User#003만 반환
  → 수백만 일반 사용자를 모두 스캔할 필요 없음
```

실용 사례: 처리되지 않은 메시지만 인덱싱하기. `processedAt` 속성이 없는 항목만 GSI에 포함 → 처리 대기 메시지만 효율적으로 조회.

## Query vs Scan의 비용 차이 수학

Query와 Scan의 비용 차이를 실제 수치로 보면 직관적으로 이해된다.

```
[시나리오] 
테이블: 100만 개 항목, 각 항목 평균 1KB
전체 테이블 크기: 약 1GB

파티션 키 기준으로 10,000개 항목이 userId=U001에 해당

Scan 실행 시:
  전체 100만 개 항목 읽기 = ceil(1,000,000 × 1KB / 4KB) × 0.5 RCU
  = 250,000 × 0.5 = 125,000 RCU 소비

Query 실행 시 (userId=U001):
  10,000개 항목만 읽기 = ceil(10,000 × 1KB / 4KB) × 0.5 RCU  
  = 2,500 × 0.5 = 1,250 RCU 소비

비용 차이: 125,000 / 1,250 = 100배 차이!

FilterExpression 함정:
  Query(userId=U001) + FilterExpression(status=COMPLETED)
  10,000개 읽고 8,000개 필터링 → 1,250 RCU 소비 (필터 무관)
```

> 📚 **사례**: 2021년 한 한국 핀테크 스타트업이 DynamoDB로 전환 후 첫 달 청구서가 예상의 50배가 나왔다. 원인 분석 결과 Lambda 함수가 매분 Scan 작업으로 미처리 트랜잭션을 찾고 있었다. Query + GSI 패턴으로 교체 후 RCU 소비가 1/50로 줄었고 비용도 정상화됐다. Scan은 "절대 사용 금지"가 아니라 "테이블 마이그레이션이나 데이터 백업처럼 명확한 이유가 있을 때만" 사용해야 한다.

## Query의 페이지네이션 처리

DynamoDB의 Query는 한 번에 최대 1MB 데이터를 반환한다. 결과가 1MB를 초과하면 `LastEvaluatedKey`가 반환되고, 다음 페이지를 요청하려면 이 키를 `ExclusiveStartKey`로 전달해야 한다.

```python
def query_all_orders(user_id: str) -> list:
    all_items = []
    last_evaluated_key = None
    
    while True:
        kwargs = {
            'KeyConditionExpression': Key('userId').eq(user_id)
        }
        if last_evaluated_key:
            kwargs['ExclusiveStartKey'] = last_evaluated_key
        
        response = table.query(**kwargs)
        all_items.extend(response['Items'])
        
        last_evaluated_key = response.get('LastEvaluatedKey')
        if not last_evaluated_key:
            break  # 마지막 페이지
    
    return all_items
```

페이지네이션을 무시하고 첫 페이지만 처리하면 데이터 누락이 발생한다. 특히 Lambda 함수에서 DynamoDB를 호출할 때 이 실수가 자주 발생한다.

## Parallel Scan — 대규모 데이터 마이그레이션

Scan은 일반적으로 피해야 하지만, 데이터 마이그레이션이나 전체 테이블 처리가 필요할 때는 **Parallel Scan**으로 성능을 높일 수 있다.

```python
import threading

def scan_segment(table, segment: int, total_segments: int, results: list):
    """각 세그먼트를 별도 스레드에서 스캔"""
    response = table.scan(
        Segment=segment,
        TotalSegments=total_segments
    )
    results.extend(response['Items'])

def parallel_scan(table, num_threads: int = 10) -> list:
    results = []
    threads = []
    
    for i in range(num_threads):
        t = threading.Thread(
            target=scan_segment,
            args=(table, i, num_threads, results)
        )
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    return results
```

Parallel Scan에서 세그먼트 수는 보통 테이블 파티션 수 이하로 설정한다. 너무 많은 세그먼트는 오히려 overhead가 생긴다.

오늘 살펴본 파티션 키 카디널리티의 수학, LSI/GSI의 내부 차이, Single-Table Design 패턴은 DynamoDB를 "제대로" 사용하는 핵심이다. 다음 day에서는 읽기/쓰기 용량 단위를 계산하는 수학과 DynamoDB Streams의 내부 동작을 살펴본다.

## 📝 연습 문제

**문제 1.** LSI를 사용해야 하는 상황과 GSI를 사용해야 하는 상황을 구분하는 기준은?

A) 데이터 양이 많으면 LSI, 적으면 GSI
B) 기본 테이블과 동일한 파티션 키를 사용하고 테이블 생성 시 설계가 확정됐으면 LSI, 다른 파티션 키가 필요하거나 나중에 추가 필요하면 GSI
C) 읽기 위주는 LSI, 쓰기 위주는 GSI
D) 비용이 중요하면 LSI, 성능이 중요하면 GSI

**정답: B**
해설: LSI는 기본 테이블과 동일한 파티션 키를 사용하면서 정렬 키만 변경하는 인덱스다. 테이블 생성 시에만 정의할 수 있으며 이후 변경/삭제가 불가능하다. 강력한 일관성을 지원하고 기본 테이블 용량을 공유한다. GSI는 기본 테이블과 다른 속성을 파티션 키로 사용할 수 있고 언제든 추가/삭제가 가능하다. 테이블 설계가 확정되지 않았거나 새로운 조회 패턴이 생길 때 GSI를 선택한다.

---

**문제 2.** 다음 중 GSI Projection ALL 대신 KEYS_ONLY를 선택해야 하는 상황은?

A) 항상 GSI 쿼리 결과만으로 모든 정보를 표시해야 할 때
B) GSI 스토리지 비용을 최소화하고, 추가 속성은 BatchGetItem으로 조회할 수 있는 경우
C) 강력한 일관성이 필요한 경우
D) GSI에 대한 쓰기 처리량이 높아야 하는 경우

**정답: B**
해설: KEYS_ONLY 프로젝션은 GSI에 기본 키와 인덱스 키만 저장해 스토리지 비용을 최소화한다. 단, GSI 쿼리로 키 목록을 얻은 후 전체 속성이 필요하면 BatchGetItem으로 추가 조회가 필요하다. 이 패턴은 GSI 스토리지 비용은 줄이지만 RCU는 두 번 소비하는 트레이드오프가 있다. 항상 전체 속성이 필요하고 추가 조회 비용을 피하고 싶다면 ALL을 사용한다.

---

**문제 3.** Single-Table Design을 사용하는 주된 이유는?

A) DynamoDB 테이블 수 제한(256개)을 피하기 위해
B) 한 번의 쿼리로 여러 엔티티 유형을 가져와 네트워크 왕복을 줄이기 위해
C) IAM 정책 관리를 단순화하기 위해
D) 자동 백업이 테이블당 한 개만 가능하기 때문

**정답: B**
해설: Single-Table Design의 핵심 이점은 한 번의 Query로 여러 관련 엔티티를 가져올 수 있다는 것이다. 예를 들어 사용자 프로필 + 최근 주문을 한 Query로 가져오면 1번의 네트워크 왕복이 필요하지만, 별도 테이블 방식이면 2번이 필요하다. 낮은 지연이 중요한 서버리스 아키텍처에서 네트워크 왕복 최소화가 성능에 큰 영향을 준다. DynamoDB 테이블 수 제한은 별도의 현실적 제약이지만 Single-Table Design의 주 목적은 아니다.

---

**문제 4.** GSI WCU를 기본 테이블 WCU의 절반으로 설정했더니 간헐적으로 ProvisionedThroughputExceededException이 발생한다. 원인은?

A) 기본 테이블 WCU 부족
B) GSI WCU 부족으로 GSI 복제가 지연되어 기본 테이블 쓰기까지 throttling
C) 읽기 요청 과다
D) 인터넷 연결 문제

**정답: B**
해설: GSI는 기본 테이블에 쓰기가 발생할 때마다 비동기적으로 업데이트된다. GSI WCU가 기본 테이블 쓰기 속도를 따라가지 못하면 GSI 쓰기가 throttling되고, 이 throttling이 기본 테이블 쓰기에도 영향을 미친다. 기본 테이블은 쓰기가 가능한 상태여도 GSI 복제를 위한 용량이 없으면 전체 쓰기가 거부될 수 있다. 해결책은 GSI WCU를 기본 테이블 WCU 이상으로 설정하거나 온디맨드 모드로 전환하는 것이다.

---

**문제 5.** DynamoDB 테이블에서 Query + FilterExpression을 사용해 100개의 항목만 반환받았는데 RCU 소비가 예상보다 훨씬 높다. 가장 가능성 높은 원인은?

A) FilterExpression이 비싼 연산이라서
B) 반환된 100개 이전에 FilterExpression으로 걸러진 항목들도 모두 RCU를 소비했기 때문
C) Query 자체에 기본 RCU 오버헤드가 있어서
D) Strongly Consistent Read 모드가 자동으로 활성화되어서

**정답: B**
해설: FilterExpression은 DynamoDB가 키 조건으로 데이터를 읽은 후 클라이언트 측에서 필터링하는 것이다. DynamoDB는 KeyConditionExpression에 맞는 모든 항목을 읽은 후 FilterExpression을 적용한다. 읽은 항목이 10,000개이고 그 중 100개가 필터를 통과했다면, RCU는 100개가 아닌 10,000개 기준으로 소비된다. FilterExpression은 반환 데이터를 줄여 네트워크 비용을 절감하지만 RCU는 절감하지 못한다. RCU 절감을 원한다면 GSI를 설계해 KeyConditionExpression으로 필요한 항목만 읽어야 한다.

---

**문제 6.** 스타트업이 DynamoDB로 다음 접근 패턴이 있는 SNS 서비스를 구현한다: 1) 사용자별 게시글 목록(시간순), 2) 해시태그별 게시글 목록, 3) 특정 게시글의 좋아요 수. 가장 적합한 설계는?

A) 세 개의 별도 테이블(Posts, Tags, Likes)
B) PK=userId, SK=timestamp 테이블 + 해시태그 GSI + 좋아요 카운터 속성
C) 모든 데이터를 하나의 속성에 JSON으로 저장
D) PK=postId만 있는 단순 테이블

**정답: B**
해설: Single-Table Design 또는 핵심 테이블 + 인덱스 패턴이다. 기본 테이블은 PK=userId, SK=timestamp로 "사용자별 게시글 시간순" 조회를 지원한다. 해시태그 검색을 위한 GSI를 별도로 설계(PK=hashtag, SK=timestamp)하거나 hashtag 테이블을 분리한다. 좋아요 수는 Atomic Counter(ADD likesCount :1)로 항목의 속성으로 관리한다. 세 개 별도 테이블(A)은 여러 패턴을 조합할 때 여러 번의 네트워크 왕복이 필요하다.

---

**문제 7.** DynamoDB의 Query 작업에서 LastEvaluatedKey가 반환됐을 때의 올바른 처리 방법은?

A) 첫 번째 페이지만 처리하고 LastEvaluatedKey는 무시해도 된다
B) LastEvaluatedKey를 ExclusiveStartKey로 설정해 다음 Query를 실행하고, LastEvaluatedKey가 없을 때까지 반복한다
C) LastEvaluatedKey를 Limit 파라미터로 사용한다
D) LastEvaluatedKey가 반환되면 오류가 발생한 것이다

**정답: B**
해설: DynamoDB Query는 한 번에 최대 1MB의 데이터를 반환한다. 결과가 1MB를 초과하거나 Limit 파라미터에 도달하면 LastEvaluatedKey가 반환된다. 이 키를 다음 Query의 ExclusiveStartKey로 전달하면 중단된 지점부터 계속 조회할 수 있다. LastEvaluatedKey가 없으면 마지막 페이지다. 페이지네이션을 처리하지 않으면 전체 데이터의 일부만 처리하는 버그가 발생한다 — 특히 Lambda 함수에서 자주 발생하는 실수다.

---
