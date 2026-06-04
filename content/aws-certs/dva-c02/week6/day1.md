# Day 26 - DynamoDB: NoSQL의 철학과 파티션 설계의 수학

관계형 데이터베이스를 오래 써온 개발자가 DynamoDB를 처음 배울 때 가장 충격을 받는 부분은 두 가지다. 첫째, JOIN이 없다. 둘째, 어떻게 데이터를 조회할지를 먼저 결정한 다음 테이블을 설계해야 한다 — RDBMS와는 정반대 순서다. 이 day에서는 왜 Amazon이 2007년 DynamoDB의 전신인 Dynamo를 만들었는지, 그 핵심 아이디어인 파티셔닝과 일관성 모델이 어떻게 동작하는지를 이해한다. 이 원리를 이해하면 DVA-C02의 DynamoDB 문제는 외우지 않아도 풀린다.

## Dynamo 논문의 배경 — 2007년 Amazon의 고민

2007년 10월, Amazon의 수석 엔지니어들이 ACM SOSP 학술회의에서 "Dynamo: Amazon's Highly Available Key-value Store"라는 논문을 발표했다. 이 논문은 분산 시스템 역사에서 가장 영향력 있는 논문 중 하나가 됐다.

당시 Amazon의 문제는 이랬다. MySQL 같은 관계형 DB는 트랜잭션을 위해 락(lock)을 사용하고, 분산 확장이 어려우며, 특히 피크 트래픽(블랙 프라이데이, 크리스마스)에서 수십만 TPS를 처리하기 어렵다. Amazon의 수석 과학자 Werner Vogels는 "Amazon의 수많은 서비스가 95% 이상의 쿼리에서 PRIMARY KEY를 사용하며, 복잡한 JOIN이 거의 필요없다"는 분석을 했다. 그렇다면 JOIN을 포기하고 수평 확장에 최적화된 스토리지를 만들면 어떨까?

Dynamo 논문은 일관적인 해싱(Consistent Hashing), 벡터 클록(Vector Clock), 가십 프로토콜(Gossip Protocol), 최종 일관성(Eventual Consistency) 같은 분산 시스템 개념을 조합한 Key-Value 스토리지를 설계했다. 이것이 DynamoDB의 이론적 토대다.

> 💡 **관련 이론**: Dynamo 논문은 CAP 정리(Brewer, 2000)를 실용적으로 해석한 대표적 사례다. CAP 정리는 분산 시스템에서 일관성(Consistency), 가용성(Availability), 파티션 내성(Partition Tolerance) 중 두 개만 보장할 수 있다고 한다. Amazon의 Dynamo는 AP(가용성 + 파티션 내성)를 선택하고 일관성을 희생해 "eventual consistency"를 채택했다. DynamoDB는 이 기반 위에서 선택적으로 Strong Consistency를 추가 제공한다.

## DynamoDB vs RDBMS — 패러다임의 차이

| 개념 | RDBMS | DynamoDB |
|------|-------|----------|
| 저장 단위 | 행(Row) | 항목(Item) |
| 조직 단위 | 테이블, 스키마 | 테이블, 파티션 |
| 스키마 | 고정 (DDL 필수) | 유연 (PK 외 자유) |
| 쿼리 방식 | SQL, 임의 컬럼 검색 | PK 기반만 효율적 |
| 확장 방식 | 수직 확장(더 큰 서버) | 수평 확장(파티션 추가) |
| 트랜잭션 | 기본 ACID | TransactWrite/Get (2x 비용) |
| JOIN | 자유롭게 | 없음 (애플리케이션 레벨) |
| 인덱스 | 자유롭게 생성 | LSI(5개), GSI(20개) 제한 |
| 확장 한도 | TB 수준(단일 서버) | PB 수준(자동 파티셔닝) |

RDBMS는 "데이터를 어떻게 저장할까"를 먼저 생각하고, 나중에 다양한 쿼리로 데이터를 뽑는다. DynamoDB는 반대다 — "어떻게 조회할까"를 먼저 결정하고 그에 맞춰 PK와 인덱스를 설계한다. 이 패러다임 전환이 DynamoDB 학습의 첫 번째 관문이다.

> 📚 **사례**: Airbnb는 2019년에 검색 서비스의 일부 데이터 레이어를 MySQL에서 DynamoDB로 전환했다. 이유는 단순했다 — 검색 결과 캐싱과 사용자별 선호 저장 같은 키-값 패턴에서 MySQL의 락 경합이 성능 병목이 됐기 때문이다. DynamoDB 전환 후 p99 지연 시간이 200ms에서 10ms로 줄었다. 단, 검색 필터와 정렬 같은 복잡한 쿼리는 Elasticsearch를 별도로 유지했다 — DynamoDB의 한계를 알고 적재적소에 사용한 사례다.

## 파티셔닝 메커니즘 — SHA-256 해시와 파티션 결정

DynamoDB가 PK 값을 받으면 내부적으로 SHA-256 해시를 계산하고, 해시 값으로 데이터가 저장될 파티션을 결정한다. 같은 PK 값은 항상 같은 파티션에 저장된다.

```
파티션 키 → SHA-256 해시 → 해시 공간에서 파티션 결정
                           → 해당 파티션 노드에 저장

예시:
"user001" → hash(user001) = 0x7a3f... → 파티션 5
"user002" → hash(user002) = 0x1b2c... → 파티션 2
"user003" → hash(user003) = 0x9d4a... → 파티션 5  (우연히 같은 파티션)
```

파티션 하나의 용량 한도:
- 스토리지: 최대 10GB
- 처리량: 최대 3,000 RCU + 1,000 WCU

10GB를 초과하거나 처리량 한도에 도달하면 S3가 자동으로 파티션을 분할(split)한다. 이 분할은 자동이지만 수 분이 걸릴 수 있으며, 그 사이에 throttling이 발생할 수 있다.

> 🔍 **더 깊이**: DynamoDB의 파티셔닝은 일관적 해싱(Consistent Hashing)의 변형을 사용한다. 일관적 해싱의 핵심 특성은 노드(파티션)가 추가/제거될 때 재배치되는 데이터의 양이 최소화된다는 것이다. 일반 해시(`key % N`)는 N이 변할 때 거의 모든 데이터를 재배치해야 하지만, 일관적 해싱은 1/N의 데이터만 이동한다. DynamoDB가 PB 규모에서도 파티션 추가를 원활하게 처리할 수 있는 이유다.

## 핫 파티션 문제 — 잘못된 PK 설계의 대가

가장 흔한 DynamoDB 설계 실수가 낮은 카디널리티(cardinality) 값을 파티션 키로 사용하는 것이다. 카디널리티란 고유 값의 수다.

```
나쁜 PK 예시들:
  status: "PENDING"/"COMPLETED"/"FAILED"     → 3가지 파티션만 존재
  country: "KR"/"US"/"JP"                   → 수백 가지 파티션
  date: "2026-06-26"                         → 오늘 모든 쓰기가 한 파티션에 집중
  boolean: true/false                         → 2가지 파티션만

좋은 PK 예시들:
  userId: UUID                               → 수백만 고유 값
  orderId: UUID                              → 수백만 고유 값
  deviceId: 디바이스 시리얼번호              → 균등 분산
```

날짜를 PK로 사용하는 패턴이 특히 위험하다. 오늘 날짜("2026-06-26")를 PK로 쓰면 오늘의 모든 쓰기가 하나의 파티션에 집중된다. 이 파티션은 1,000 WCU 한도를 초과하면 `ProvisionedThroughputExceededException`이 발생한다.

| 안티패턴 | 문제 | 개선 방법 |
|---------|------|---------|
| PK = 날짜 | 오늘 쓰기가 한 파티션 집중 | PK = `날짜#샤드번호` (예: `2026-06-26#3`) |
| PK = status 코드 | 3~5개 파티션만 존재 | PK = userId, GSI PK = status |
| PK = sequential ID | 순차 ID는 해시 후에도 치우침 가능 | PK = UUID |
| PK = category | 인기 카테고리에 집중 | PK = `category#uuid` |

> ⚠️ **함정**: "DynamoDB가 Adaptive Capacity로 핫 파티션을 자동 처리한다"고 알고 있는 수험생이 많다. Adaptive Capacity는 다른 파티션의 여유 용량을 핫 파티션에 재분배하는 기능이다. 하지만 이것은 임시 완충제일 뿐이다. 테이블 전체 WCU를 초과하면 Adaptive Capacity도 도움이 안 된다. 근본 해결책은 항상 PK 설계다.

## DynamoDB의 데이터 유형 전체

DynamoDB는 세 범주의 데이터 유형을 지원한다.

**스칼라(Scalar) 유형**: 단일 값
- `S` - String: `"hello"`, `"2026-06-26T00:00:00Z"` (날짜는 ISO 8601 문자열로 저장)
- `N` - Number: `42`, `3.14`, `1234567890123` (정수, 소수, 큰 수 모두)
- `B` - Binary: Base64 인코딩 바이너리 데이터 (이미지 썸네일, 직렬화된 데이터)
- `BOOL` - Boolean: `true`, `false`
- `NULL` - Null: `true` (값이 없음을 명시적으로 표현)

**집합(Set) 유형**: 같은 타입의 중복 없는 집합
- `SS` - String Set: `{"apple", "banana", "cherry"}`
- `NS` - Number Set: `{1, 2, 3, 4, 5}`
- `BS` - Binary Set: 바이너리 집합

**문서(Document) 유형**: 중첩 구조
- `M` - Map: `{"key1": {"S": "value"}, "key2": {"N": "42"}}` — 중첩 JSON 객체
- `L` - List: `[{"S": "hello"}, {"N": "42"}, {"BOOL": true}]` — 혼합 타입 배열

항목 최대 크기는 **400KB**다. 이미지, 동영상 같은 큰 데이터는 S3에 저장하고 DynamoDB에는 S3 URL 또는 키만 저장하는 것이 표준 패턴이다.

> 💡 **관련 이론**: DynamoDB의 Map(`M`) 타입은 JSON과 개념적으로 동일하다. 사실 DynamoDB의 데이터 모델은 JSON을 이진 형식으로 인코딩한 것이다(내부적으로 CBOR과 유사한 형식). `aws dynamodb get-item --output json`을 실행하면 DynamoDB가 반환하는 응답이 타입 어노테이션이 포함된 JSON임을 볼 수 있다. Map 타입의 중첩 깊이에는 이론적 제한이 없지만, 전체 항목 크기 400KB 안에 들어야 한다.

## 읽기 일관성 모델 — 분산 시스템의 트레이드오프

DynamoDB는 데이터를 **최소 3개의 AZ에 걸쳐** 동기적으로 복제한다. 쓰기가 완료됐다는 응답은 3개 AZ 중 최소 2개(quorum)에 쓰기가 성공했을 때 돌아온다.

이 분산 복제 때문에 읽기 시점에 따라 최신 데이터를 보장할 수 없는 상황이 생긴다.

**최종 일관성 읽기(Eventually Consistent Read)**:
DynamoDB가 임의의 노드 중 하나에서 읽는다. 방금 쓴 데이터가 아직 다른 노드에 전파되지 않았다면 이전 버전 데이터를 반환할 수 있다. 소비: 4KB당 0.5 RCU. 기본값.

**강력한 일관성 읽기(Strongly Consistent Read)**:
DynamoDB가 최신 데이터를 보장하는 "주 노드(leader)"에서 읽는다. 항상 최신 쓰기 후의 데이터를 반환한다. 소비: 4KB당 1 RCU (최종 일관성의 2배). `ConsistentRead: true` 파라미터 필요.

**트랜잭션 읽기(Transactional Read)**:
여러 항목을 원자적으로 읽는다. 소비: 4KB당 2 RCU. `TransactGetItems` API 사용.

| 읽기 유형 | 비용 | 최신 데이터 보장 | GSI 지원 |
|----------|------|---------------|---------|
| Eventually Consistent | 0.5 RCU/4KB | ❌ (거의 항상 최신) | ✅ |
| Strongly Consistent | 1 RCU/4KB | ✅ | ❌ (기본 테이블 + LSI만) |
| Transactional | 2 RCU/4KB | ✅ | ❌ |

> ⚠️ **함정**: **GSI는 강력한 일관성 읽기를 지원하지 않는다.** 항상 최종 일관성만 가능하다. 이는 GSI가 비동기적으로 복제되기 때문이다 — 기본 테이블에 쓰기가 완료돼도 GSI에 반영되기까지 짧은 지연이 있다. 강력한 일관성이 필요하면 기본 테이블이나 LSI를 사용해야 한다.

## DynamoDB 표현식 시스템 — 5가지 표현식의 역할

DynamoDB는 조건, 업데이트, 필터를 SQL 대신 표현식(Expression)으로 처리한다. 5가지 표현식을 혼동하지 않는 것이 중요하다.

```python
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Orders')

# 1. KeyConditionExpression — Query에서 파티션 키(필수) + 정렬 키(선택) 조건
response = table.query(
    KeyConditionExpression=Key('userId').eq('U001') & 
                           Key('orderDate').between('2026-01-01', '2026-06-30')
)

# 2. FilterExpression — 읽은 후 클라이언트 측 필터링 (RCU는 그대로 소비!)
response = table.query(
    KeyConditionExpression=Key('userId').eq('U001'),
    FilterExpression=Attr('status').eq('COMPLETED')  # RCU 절감 없음
)

# 3. UpdateExpression — 항목 속성 수정
table.update_item(
    Key={'userId': 'U001', 'orderDate': '2026-06-26'},
    UpdateExpression='SET #s = :status, updatedAt = :ts ADD orderCount :one',
    ExpressionAttributeNames={'#s': 'status'},   # 예약어 우회
    ExpressionAttributeValues={':status': 'SHIPPED', ':ts': '2026-06-26T10:00:00Z', ':one': 1}
)

# 4. ConditionExpression — 조건부 쓰기 (조건 불일치 시 ConditionalCheckFailedException)
table.put_item(
    Item={'userId': 'U001', 'email': 'kim@example.com'},
    ConditionExpression=Attr('userId').not_exists()  # 중복 방지
)

# 5. ProjectionExpression — 반환할 속성 선택 (네트워크 비용 절감, RCU는 전체 항목 기준)
response = table.get_item(
    Key={'userId': 'U001'},
    ProjectionExpression='email, #n',
    ExpressionAttributeNames={'#n': 'name'}
)
```

> ⚠️ **함정**: `FilterExpression`은 항목을 읽은 **후에** 필터링한다. 즉, DynamoDB는 먼저 파티션 키 조건에 맞는 모든 항목을 읽고(RCU 소비), 그 다음 FilterExpression을 적용해서 일부를 제거한다. 결과 항목이 10개여도 읽은 항목이 1,000개면 1,000개 기준으로 RCU가 청구된다. RCU를 절감하려면 FilterExpression이 아니라 GSI를 설계해 KeyConditionExpression으로 검색해야 한다.

## Adaptive Capacity와 Burst Capacity

두 기능 모두 단기 처리량 초과를 처리하지만 방식이 다르다.

**Burst Capacity**: 미사용된 RCU/WCU를 최대 5분치 누적했다가 갑작스러운 트래픽 급증 시 사용. 자동 동작, 설정 불필요.

**Adaptive Capacity**: 테이블 내 한 파티션이 핫 파티션이 됐을 때, 다른 파티션의 여유 용량을 핫 파티션으로 재분배. 2018년부터 "즉시(instant)" 방식으로 개선 — 이전에는 수 분이 걸렸다.

둘 다 임시 완충제이며, 근본 해결은 설계다:
- Burst: 짧은 피크는 처리하지만 지속적 초과는 throttling
- Adaptive Capacity: 핫 파티션은 완화하지만 전체 테이블 처리량 한도 초과는 처리 불가

## DynamoDB Local — 로컬 개발 환경

DynamoDB Local은 Java로 작성된 DynamoDB 에뮬레이터로, Docker나 JAR 파일로 로컬에서 실행할 수 있다. 실제 AWS 계정 없이 DynamoDB를 개발하고 통합 테스트할 수 있다.

```bash
# Docker로 DynamoDB Local 실행
docker run -p 8000:8000 amazon/dynamodb-local

# SDK를 로컬 엔드포인트로 연결
import boto3
dynamodb = boto3.resource(
    'dynamodb',
    endpoint_url='http://localhost:8000',
    region_name='us-east-1',
    aws_access_key_id='dummy',
    aws_secret_access_key='dummy'
)
```

주의: DynamoDB Local은 실제 DynamoDB와 동일하지 않다. 성능 특성, 처리량 제한, 일부 신규 기능은 시뮬레이션되지 않는다. 통합 테스트에는 적합하지만 성능 테스트에는 실제 DynamoDB를 사용해야 한다.

오늘 살펴본 DynamoDB의 철학 — 파티션 해싱, 일관성 모델, 표현식 시스템 — 은 나머지 DynamoDB 주제 전반의 기반이다. 다음 day에서는 이 기반 위에서 LSI/GSI를 어떻게 설계하고, 단일 테이블 설계(Single-Table Design) 패턴이 왜 DynamoDB의 표준이 됐는지를 살펴본다.

## 📝 연습 문제

**문제 1.** DynamoDB 테이블에서 최종 일관성 읽기와 강력한 일관성 읽기의 RCU 소비는?

A) 최종 일관성 0.5 RCU/4KB, 강력한 일관성 2 RCU/4KB
B) 최종 일관성 1 RCU/4KB, 강력한 일관성 0.5 RCU/4KB
C) 최종 일관성 0.5 RCU/4KB, 강력한 일관성 1 RCU/4KB
D) 둘 다 1 RCU/4KB로 동일

**정답: C**
해설: 최종 일관성 읽기는 4KB당 0.5 RCU를 소비하고, 강력한 일관성 읽기는 4KB당 1 RCU를 소비한다(최종 일관성의 2배). 트랜잭션 읽기는 4KB당 2 RCU다. 강력한 일관성은 `ConsistentRead: true` 파라미터로 활성화한다. 비용이 2배인 이유는 강력한 일관성 읽기가 최신 데이터를 보장하는 리더 노드에서 읽기 때문에 더 많은 내부 조정이 필요하기 때문이다.

---

**문제 2.** DynamoDB에서 GSI를 사용할 때 강력한 일관성 읽기를 요청하면 어떻게 되는가?

A) 강력한 일관성으로 읽어진다
B) 요청이 에러로 실패한다 (지원하지 않음)
C) 자동으로 최종 일관성으로 대체되어 읽어진다
D) 기본 테이블에서 조회해 강력한 일관성을 보장한다

**정답: B**
해설: GSI는 강력한 일관성 읽기를 지원하지 않는다. GSI 조회에서 `ConsistentRead: true`를 설정하면 `ValidationException`이 발생한다. GSI는 기본 테이블에서 비동기적으로 복제되기 때문에 항상 약간의 복제 지연이 있고, 이 때문에 강력한 일관성을 보장할 수 없다. 강력한 일관성이 필요한 조회는 기본 테이블이나 LSI를 사용해야 한다.

---

**문제 3.** DynamoDB FilterExpression에 대한 올바른 설명은?

A) FilterExpression은 인덱스를 활용하므로 RCU를 절감한다
B) FilterExpression은 읽은 후 필터링하므로 RCU는 원본 데이터 기준으로 소비된다
C) FilterExpression은 DynamoDB가 디스크에서 읽기 전에 적용된다
D) FilterExpression을 사용하면 자동으로 GSI가 생성된다

**정답: B**
해설: FilterExpression은 DynamoDB가 KeyConditionExpression 기준으로 데이터를 모두 읽은 후 클라이언트 측에서 필터링한다. 즉, 파티션에서 1,000개를 읽었는데 FilterExpression으로 10개만 남겨도 RCU는 1,000개 기준으로 소비된다. RCU를 절감하려면 FilterExpression 대신 인덱스(GSI)를 설계해 KeyConditionExpression으로 필요한 데이터만 읽어야 한다.

---

**문제 4.** 다음 중 DynamoDB에서 핫 파티션이 발생할 가능성이 가장 높은 파티션 키 설계는?

A) userId(UUID 형식)
B) 주문 생성 날짜(예: "2026-06-26")
C) 디바이스 시리얼 번호
D) 이메일 주소

**정답: B**
해설: 날짜를 파티션 키로 사용하면 오늘 날짜("2026-06-26")에 해당하는 파티션에 오늘의 모든 쓰기가 집중된다. 이것이 핫 파티션의 전형적인 원인이다. 파티션당 최대 1,000 WCU 한도를 초과하면 throttling이 발생한다. UUID(A), 시리얼 번호(C), 이메일(D)은 모두 높은 카디널리티를 가져 쓰기가 여러 파티션에 고르게 분산된다.

---

**문제 5.** DynamoDB 항목의 최대 크기와, 이 제한을 우회하기 위한 표준 패턴은?

A) 최대 1MB, 대용량 데이터를 파편화해 여러 항목에 저장
B) 최대 400KB, 대용량 데이터는 S3에 저장하고 DynamoDB에는 S3 URL 또는 키만 저장
C) 최대 64KB, 대용량 데이터는 ElastiCache에 저장
D) 최대 5TB, 제한 없음

**정답: B**
해설: DynamoDB 항목의 최대 크기는 400KB다. 이미지, 동영상, 대용량 문서처럼 이를 초과하는 데이터는 S3에 저장하고 DynamoDB에는 S3 객체의 URL이나 키만 저장한다. 이것이 AWS가 공식 문서에서 권장하는 표준 패턴이다. 여러 항목에 파편화하는 방법(A)은 원자적 업데이트가 어렵고 관리가 복잡하다. DynamoDB 항목 크기 한도는 현재 400KB이며 변경되지 않았다.

---

**문제 6.** 전자상거래 플랫폼에서 DynamoDB의 주문 테이블에 userId를 파티션 키로, orderId를 정렬 키로 사용하고 있다. 특정 userId의 최근 10개 주문을 가져오는 가장 효율적인 방법은?

A) Scan 작업으로 전체 테이블을 읽어 userId로 필터링
B) Query 작업 + KeyConditionExpression(userId) + ScanIndexForward=false + Limit=10
C) GetItem 작업을 10번 반복
D) BatchGetItem으로 10개 항목을 동시에 조회

**정답: B**
해설: Query 작업은 파티션 키(userId)로 특정 파티션을 지정하고, 정렬 키(orderId)로 정렬된 데이터에서 범위 조회가 가능하다. `ScanIndexForward=false`는 정렬 키의 역순(최신순)으로 반환하고, `Limit=10`으로 10개만 가져온다. Scan(A)은 전체 테이블을 읽어 비효율적이다. GetItem(C)은 정확한 키를 미리 알아야 하고, 최근 주문의 orderId를 모르면 사용 불가다. BatchGetItem(D)도 마찬가지로 정확한 키가 필요하다.

---

**문제 7.** DynamoDB의 Adaptive Capacity와 Burst Capacity의 차이는?

A) Burst Capacity는 파티션 간 용량을 재분배하고, Adaptive Capacity는 5분치 용량을 누적한다
B) Burst Capacity는 5분치 미사용 용량을 누적해 갑작스러운 트래픽에 대응하고, Adaptive Capacity는 핫 파티션에 다른 파티션의 여유 용량을 재분배한다
C) 둘 다 동일한 기능이며 단지 이름이 다르다
D) Burst Capacity는 온디맨드 모드에서만, Adaptive Capacity는 프로비저닝 모드에서만 작동한다

**정답: B**
해설: Burst Capacity는 접두사/파티션 단위로 미사용 용량을 최대 5분(300초)치 누적하고, 트래픽 급증 시 이 누적된 용량을 먼저 소진하는 방식이다. Adaptive Capacity는 테이블 내 파티션 간에 용량을 재분배한다 — 한 파티션이 핫해지면 다른 파티션의 여유 용량을 빌려온다. 두 기능은 보완적이며 둘 다 자동으로 동작한다. 하지만 두 기능 모두 근본적인 PK 설계 문제를 해결하지는 못한다.

---
