# Day 30 - Week 6 종합 복습: DynamoDB 전체 지형도

Week 6의 마지막 날이다. DynamoDB는 DVA-C02에서 가장 많은 문제가 쏟아지는 서비스다. 단순 암기로는 변형 문제를 버티기 어렵다. 이 day에서는 한 주간 배운 파티션 키 설계 수학, 읽기 일관성 모델, LSI/GSI 내부 차이, DAX 캐시 계층, Streams + Lambda 연동, 트랜잭션 2PC, TTL 비동기 삭제를 하나의 지형도로 연결하고, 실전 시험 유형의 종합 문제로 마무리한다. DynamoDB를 "파티션 수준에서 어떻게 데이터가 저장되고 읽히는가"라는 관점으로 본 사람과 API 이름만 외운 사람은 같은 문제에서 결과가 전혀 다르다.

## DynamoDB 전체 아키텍처 지형도

```
클라이언트 요청
      │
      ▼
  [DAX 클러스터]  ─── 캐시 히트 → μs 반환
      │ 캐시 미스
      ▼
[DynamoDB 요청 라우터]
      │
      ▼
[파티션 메타데이터 서비스]
  파티션 키 → 해시 → 담당 스토리지 노드 결정
      │
      ▼
[스토리지 노드 (B-Tree + WAL)]
  Primary Node ──복제──► Replica 1
               ──복제──► Replica 2 (3개 AZ 분산)
      │
      ├── 읽기 (Eventually Consistent): Replica 어느 것이든
      ├── 읽기 (Strongly Consistent): Primary만
      └── 쓰기: Primary → WAL → 복제 완료
      │
      ▼
[DynamoDB Streams 샤드]  (변경 24시간 보존)
      │
      ▼
[Lambda ESM 폴링]
  배치 처리 → BisectBatchOnFunctionError → DLQ
```

> 💡 **관련 이론**: DynamoDB의 내부 스토리지는 B-Tree 기반 LSM(Log-Structured Merge-tree)이다. 쓰기 시 먼저 Write-Ahead Log(WAL)에 기록하고, Primary 노드가 쓰기를 인정하면 백그라운드에서 나머지 복제본에 전파한다. Eventually Consistent 읽기는 이 전파가 완료되기 전에 Replica에서 읽을 수 있어 오래된 데이터를 볼 수 있다. Strongly Consistent 읽기는 Primary에서만 읽으므로 항상 최신이지만 RCU를 2배 소비한다.

## 파티션 키 설계 — 핫 파티션 수학

파티션 한도: **3,000 RCU + 1,000 WCU + 10GB**

항목이 특정 파티션에 집중되면 그 파티션이 한도에 도달해 `ProvisionedThroughputExceededException`이 발생한다(hot partition 문제).

```
나쁜 파티션 키 예시:
  status = "PENDING" → 대부분의 새 주문이 한 파티션에 집중
  date = "2026-06-27" → 오늘 데이터가 모두 한 파티션

좋은 파티션 키 예시:
  orderId = UUID → 무작위 분산
  userId + timestamp → 사용자별 분산 + 시간 정렬

Write Sharding 패턴:
  partition_key = userId + "#" + str(random.randint(0, 9))
  → 동일 userId가 10개 파티션에 분산
  → 읽을 때 0~9 모두 Query 후 병합 필요
```

> 🔍 **더 깊이**: Adaptive Capacity는 2018년 도입된 기능으로, 한 파티션의 트래픽이 증가하면 다른 파티션의 잉여 용량을 자동으로 이동시켜 핫 파티션이 프로비저닝된 용량을 초과해도 일시적으로 버틸 수 있게 한다. 또한 Burst Capacity는 파티션이 마지막 300초(5분) 동안 사용하지 않은 용량을 최대 300초치 예비로 축적하고, 갑작스러운 스파이크 시 이를 소진한다. Adaptive Capacity와 Burst Capacity는 자동 동작하지만 지속적인 핫 파티션에는 근본 해결책이 되지 않는다.

## RCU/WCU 수학 빠른 정리

```
읽기 (기준: 4KB, ceil 올림):
  Eventually Consistent = ceil(size/4KB) × 0.5
  Strongly Consistent   = ceil(size/4KB) × 1
  Transactional Read    = ceil(size/4KB) × 2

쓰기 (기준: 1KB, ceil 올림):
  Standard Write        = ceil(size/1KB) × 1
  Transactional Write   = ceil(size/1KB) × 2

핵심: 읽기는 4KB 기준, 쓰기는 1KB 기준 → 같은 항목에서 WCU가 RCU보다 4배 많이 필요
```

계산 예시:
```
6.5KB 항목, 강력한 일관성, 초당 40회:
  ceil(6.5/4) = 2 → 2 × 1 × 40 = 80 RCU

3KB 항목, 트랜잭션 쓰기, 초당 20회:
  ceil(3/1) = 3 → 3 × 2 × 20 = 120 WCU
```

> ⚠️ **함정**: FilterExpression은 RCU를 절감하지 않는다. 조건에 맞지 않는 항목도 읽기 후 필터링하므로 RCU는 이미 소비된다. RCU를 절약하려면 KeyConditionExpression으로 읽을 항목 수 자체를 줄여야 한다. GSI를 만들어 조회 패턴에 맞는 파티션 키를 부여하는 것이 올바른 접근이다.

## LSI vs GSI 내부 동작 비교

| 항목 | LSI | GSI |
|------|-----|-----|
| PK | 기본 테이블과 동일 | 다른 속성 가능 |
| SK | 다른 속성 | 다른 속성 가능 |
| 생성 시점 | 테이블 생성 시에만 | 언제든 추가/삭제 |
| 최대 개수 | 5개 | 20개 (기본 한도, 증가 요청 가능) |
| 일관성 모델 | Eventually + **Strongly** 모두 지원 | Eventually Consistent만 |
| 용량 | 기본 테이블 용량 공유 | **별도 RCU/WCU 설정** |
| Sparse Index | 지원 | 지원 |
| 스토리지 구조 | 기본 테이블과 같은 파티션 내 별도 B-Tree | 완전히 별도의 파티션 공간 |

> 💡 **관련 이론**: LSI는 기본 테이블과 동일한 파티션 키를 공유하므로 같은 파티션 내에 함께 저장된다. 이 덕분에 기본 테이블의 Primary 노드가 LSI 데이터도 함께 관리해 Strongly Consistent 읽기가 가능하다. GSI는 완전히 별도의 파티션 공간에 비동기 복제되므로 복제 지연이 존재하고 Eventually Consistent만 지원한다. "GSI는 별개의 테이블"이라고 생각하면 이 차이가 자연스럽다.

**Sparse Index 패턴**: 모든 항목이 가지지 않는 속성을 GSI의 파티션 키로 쓰면, 그 속성이 있는 항목만 GSI에 나타난다.

```
Users 테이블:
  userId(PK) | email | isPremium (일부만 있음)

GSI: isPremium-index
  PK = isPremium → isPremium 속성 있는 항목만 인덱싱
  Query "isPremium = true" → 프리미엄 사용자만 효율적 조회
  isPremium 없는 일반 사용자는 GSI에 아예 없음 → 저장 비용 절감
```

> 📚 **사례**: Airbnb가 DynamoDB Single-Table Design을 도입할 때 예약 상태 관리에 GSI Sparse Index를 활용했다. 예약 상태가 "PENDING"인 항목에만 `pendingAt` 속성을 부여해 GSI의 PK로 사용했다. 예약이 확정되면 `pendingAt`을 삭제해 GSI에서 자동으로 제거된다. 전체 테이블 Scan 없이 "현재 PENDING 예약 전체"를 GSI Query로 O(PENDING 수)에 조회할 수 있다.

## DAX 캐시 계층 — 언제 우회하는가

```
DAX 캐시 적용:
  GetItem → Item Cache (기본 TTL 5분)
  Query   → Query Cache (기본 TTL 5분)
  Scan    → Query Cache

DAX 캐시 우회 (DynamoDB 직접):
  ConsistentRead=true 강력한 일관성 읽기
  TransactGetItems
  모든 쓰기 (Put/Update/Delete)
```

DAX 쓰기는 Write-Through: DynamoDB 먼저 쓰고 → Item Cache 업데이트 → 완료 반환. Write-Back이 아니므로 데이터 손실 없음.

> ⚠️ **함정**: DAX는 VPC 내부에서만 접근 가능하다. 인터넷에서 직접 접근 불가. Lambda가 DAX를 사용하려면 Lambda도 같은 VPC에 있어야 하고, DAX 클러스터의 보안 그룹에서 Lambda의 보안 그룹을 허용해야 한다. DAX 클러스터는 최소 3개 노드(Multi-AZ)로 구성해야 고가용성이 보장된다.

## DynamoDB Streams + Lambda ESM 상세

```
Stream 뷰 유형:
  KEYS_ONLY:          PK + SK만 (가장 저렴)
  NEW_IMAGE:          변경 후 전체 항목
  OLD_IMAGE:          변경 전 전체 항목
  NEW_AND_OLD_IMAGES: 변경 전/후 모두 (감사 로그)

Lambda ESM 핵심 설정:
  BatchSize:                    1~10,000 레코드
  BisectBatchOnFunctionError:   오류 시 배치 반으로 분할 재시도
  MaximumRetryAttempts:         최대 재시도 횟수 (기본: 무한)
  DestinationConfig:            실패 레코드 → SQS DLQ 또는 SNS
  ParallelizationFactor:        샤드당 병렬 Lambda 수 (1~10)
  FilterCriteria:               특정 이벤트 패턴만 Lambda 트리거
```

> 💡 **관련 이론**: DynamoDB Streams는 내부적으로 Kinesis 기반 아키텍처로 동작한다. 각 파티션마다 하나의 Stream 샤드가 존재하고, 샤드 내에서는 파티션 키 단위 이벤트 순서가 보장된다. Lambda ESM은 샤드를 폴링하는 방식이다 — Streams가 Lambda를 "push"하는 게 아니라 Lambda가 Streams를 "pull"한다. `ParallelizationFactor=10`으로 설정하면 하나의 샤드를 10개 Lambda가 병렬 처리하지만 같은 파티션 키의 이벤트 순서 보장이 복잡해진다.

`FilterCriteria` 예시 — INSERT 이벤트만 처리:
```json
{
  "Filters": [
    {
      "Pattern": "{\"eventName\": [\"INSERT\"]}"
    }
  ]
}
```

Lambda 함수 내 TTL 삭제 이벤트 식별:
```python
def handler(event, context):
    for record in event['Records']:
        if record['eventName'] == 'REMOVE':
            user_identity = record.get('userIdentity', {})
            if user_identity.get('type') == 'Service':
                # TTL에 의한 자동 삭제 → 비즈니스 로직 건너뜀
                continue
            # 명시적 DeleteItem 호출 → 감사 로그 기록
            log_deletion(record['dynamodb']['OldImage'])
```

> 📚 **사례**: 2019년 DoorDash 사례. 주문 완료 시 DynamoDB Streams로 이벤트를 받아 ElasticSearch 인덱스를 업데이트하는 파이프라인에서 Lambda가 BatchSize=100으로 설정돼 있었다. 주문 급증 시 처리 지연이 발생하고, Lambda 타임아웃으로 전체 배치가 실패해 같은 100개 레코드를 반복 재시도하는 루프에 빠졌다. `BisectBatchOnFunctionError=true`와 `DestinationConfig`(DLQ)를 설정하지 않아서 문제가 생겼다. 해결 후 독성 메시지(Poison Pill)는 DLQ로 격리하고 정상 레코드는 계속 처리하는 구조로 전환했다.

## 트랜잭션 vs 조건부 쓰기 선택 기준

```
단일 항목, 조건 필요 → ConditionExpression (빠르고 저렴)
여러 항목 원자성 필요 → TransactWriteItems (2× 비용)
읽기와 쓰기 원자성 필요 → TransactGetItems + TransactWriteItems
멱등한 API 요청 → ClientRequestToken (10분 유효)
```

| 시나리오 | 추천 API | 이유 |
|---------|---------|------|
| 중복 주문 방지 | PutItem + `attribute_not_exists` | 단일 항목, 조건만 필요 |
| 재고 차감 + 주문 생성 | TransactWriteItems | 두 테이블 원자성 필요 |
| 동시 수정 충돌 감지 | UpdateItem + version 조건 | Optimistic Locking |
| 대량 데이터 적재 | BatchWriteItem | 원자성 불필요, 속도 우선 |
| 선착순 쿠폰 클레임 | UpdateItem + `attribute_not_exists` | 단일 항목, First-Write-Wins |

## PITR vs On-Demand Backup vs TTL

| 항목 | PITR | On-Demand Backup | TTL |
|------|------|-----------------|-----|
| 목적 | 실수 복구 | 장기 보존 스냅샷 | 임시 데이터 자동 삭제 |
| 보존 기간 | 최대 35일 (초 단위 복원) | 무기한 | 0~48시간 내 비동기 삭제 |
| 비용 | GB당 추가 과금 | GB당 추가 과금 | 무료 (WCU 소비 없음) |
| 복원 대상 | 새 테이블로만 | 새 테이블로만 | - |
| 자동화 | 자동 (활성화 시) | 수동 또는 AWS Backup | 자동 |

> 🔍 **더 깊이**: PITR이 35일 제한인 이유는 AWS 내부적으로 변경 로그(WAL)를 35일 보존하기 때문이다. Kinesis Data Streams for DynamoDB를 추가 연결하면 변경 이력을 최대 365일 보존할 수 있고, Kinesis Firehose → S3로 파이프라인을 구성하면 S3 수명 주기 정책으로 수년간 보존이 가능하다. 장기 감사 로그가 필요하면 Streams + Kinesis가 정석이다.

## Global Tables — Active-Active 설계의 함의

```
충돌 해결: Last Writer Wins (최신 타임스탬프 우선)
복제 방식: DynamoDB Streams 기반 비동기
일관성:   각 리전에서 로컬 강력한 일관성만 가능
요건:     Streams 활성화 필수, 온디맨드 or 동일 프로비저닝
```

Global Tables를 쓸 때 알아야 하는 함정: "글로벌 Strongly Consistent"는 존재하지 않는다. 서울에서 쓴 데이터가 버지니아에 복제되기 전에 버지니아에서 강력한 일관성 읽기를 해도 서울의 최신 데이터를 볼 수 없다. 각 리전은 자신의 로컬 복제본 기준으로만 일관성을 보장한다.

> ⚠️ **함정**: Global Tables에서 두 리전이 동시에 같은 항목을 수정하면 Last Writer Wins로 충돌이 해결된다. 두 리전 모두 성공 응답을 반환했는데 한 쪽의 쓰기가 최종적으로 덮어써진다. 금융 데이터처럼 양쪽 쓰기 모두 영구적이어야 하는 경우 Global Tables의 충돌 해결 정책이 부적합할 수 있다. 이런 경우 단일 "primary" 리전에서만 쓰기를 허용하고 다른 리전은 읽기만 하는 아키텍처를 택해야 한다.

## 핵심 수치 암기표

```
항목 최대 크기:          400KB
트랜잭션 최대:           100개 항목, 4MB
BatchWriteItem:          25개 항목, 16MB
BatchGetItem:            100개 항목, 16MB
Streams 보존:            24시간 (고정)
Kinesis for DDB 보존:    최대 365일
PITR 복원 창:            35일
TTL 삭제 지연:           0~48시간
온디맨드 모드 전환:       24시간에 1회
파티션 한도:             3,000 RCU + 1,000 WCU + 10GB
GSI 기본 최대:           20개
LSI 최대:                5개 (생성 시만)
DAX 기본 TTL:            5분 (Item Cache, Query Cache)
트랜잭션 ClientRequestToken: 10분 유효
```

## 📝 Week 6 종합 연습 문제

**문제 1.** 4KB 항목을 최종 일관성으로 초당 200회, 강력한 일관성으로 초당 100회 읽는다. 총 프로비저닝 RCU는?

A) 150 RCU
B) 200 RCU
C) 250 RCU
D) 300 RCU

**정답: B**
해설: 최종 일관성 = ceil(4/4) × 0.5 × 200 = 1 × 0.5 × 200 = 100 RCU. 강력한 일관성 = ceil(4/4) × 1 × 100 = 1 × 1 × 100 = 100 RCU. 합계 = 200 RCU. 두 읽기 유형을 동시에 프로비저닝할 때는 합산한다.

---

**문제 2.** DynamoDB GSI에 대한 설명 중 옳지 않은 것은?

A) GSI는 테이블 생성 후에도 언제든 추가하거나 삭제할 수 있다
B) GSI는 기본 테이블과 별도의 RCU/WCU를 가진다
C) GSI는 Strongly Consistent 읽기를 지원한다
D) GSI의 파티션 키는 기본 테이블과 다른 속성을 사용할 수 있다

**정답: C**
해설: GSI는 Eventually Consistent 읽기만 지원한다. 기본 테이블과 완전히 별도의 파티션 공간에 비동기 복제되므로 복제 지연이 존재해 강력한 일관성이 불가능하다. Strongly Consistent를 지원하는 보조 인덱스는 LSI뿐이다(기본 테이블과 같은 파티션 내 저장이기 때문). A, B, D는 모두 GSI의 올바른 특성이다.

---

**문제 3.** DynamoDB Streams에서 Lambda ESM의 `BisectBatchOnFunctionError=true`를 설정했을 때 동작은?

A) 오류 발생 시 전체 배치를 처음부터 재시도한다
B) 오류 발생 시 배치를 반으로 분할하고 각각 별도로 재시도해 오류 원인 레코드를 격리한다
C) 오류 발생 시 즉시 DLQ로 전송한다
D) 오류 발생 시 Lambda를 재시작한다

**정답: B**
해설: `BisectBatchOnFunctionError=true`는 배치 처리 실패 시 해당 배치를 정확히 반으로 분할해 각각 별도 Lambda 호출로 재시도한다. 이를 반복하면 결국 오류를 일으키는 단일 레코드(Poison Pill)를 격리할 수 있다. `DestinationConfig`의 DLQ를 함께 설정하면 격리된 레코드가 최대 재시도 후 DLQ로 이동해 나머지 정상 처리가 계속된다. 없으면 오류 레코드가 스트림을 차단해 뒤쪽 레코드가 처리되지 않는다.

---

**문제 4.** DAX를 사용 중인 애플리케이션에서 금융 계좌 잔액을 조회할 때 항상 최신 값을 보장해야 한다. 올바른 접근법은?

A) DAX의 TTL을 0으로 설정한다
B) DAX를 우회하고 DynamoDB에 `ConsistentRead=true`로 직접 쿼리한다
C) DAX 앞에 API Gateway 캐시를 추가한다
D) DAX 클러스터 크기를 늘린다

**정답: B**
해설: DAX는 `ConsistentRead=true` 요청을 자동으로 DynamoDB에 직접 라우팅한다. 즉 애플리케이션 코드에서 `ConsistentRead=true`를 설정하면 DAX SDK가 자동으로 캐시를 우회해 DynamoDB Primary 노드에서 최신 데이터를 읽는다. DAX TTL을 0으로 설정하면 캐시를 사실상 비활성화하는 것과 같아 DAX의 의미가 없다. 금융 잔액 같은 강력한 일관성 요구사항과 일반 상품 정보 같은 최종 일관성 허용 항목을 같은 DAX 클러스터에서 처리할 때 일관성 플래그로 구분하는 것이 올바른 패턴이다.

---

**문제 5.** DynamoDB 테이블의 온디맨드 모드에서 초당 요청이 갑자기 기존 최고치의 5배로 증가했다. 어떤 현상이 발생하는가?

A) 온디맨드는 무한 확장이므로 문제없이 처리된다
B) `ProvisionedThroughputExceededException`이 발생한다 — 온디맨드도 이전 피크 2배까지만 즉시 확장 가능
C) 모드가 자동으로 프로비저닝으로 전환된다
D) 요청이 큐잉되고 나중에 처리된다

**정답: B**
해설: 온디맨드 모드는 "무한 확장"이 아니다. 직전에 처리한 트래픽 피크의 2배까지만 즉시 자동 확장된다. 5배 증가는 이 한도를 초과하므로 throttling이 발생한다. 신규 테이블이나 오랫동안 낮은 트래픽이었던 테이블은 "예열(warm-up)"이 충분하지 않아 더 낮은 임계값에서 throttling이 시작된다. 해결책: 프로비저닝 모드에서 충분한 트래픽을 처리해 예열한 후 온디맨드로 전환하거나, 프로비저닝 + Auto Scaling으로 점진적 확장한다.

---

**문제 6.** `status = "ACTIVE"` 속성이 있는 사용자만 GSI에 인덱싱하려 한다. 가장 효율적인 방법은?

A) GSI에 FilterExpression으로 status = "ACTIVE" 필터를 적용한다
B) 모든 사용자를 GSI에 인덱싱하고 Query 시 FilterExpression을 사용한다
C) status 속성을 GSI의 파티션 키로 사용한다 (Sparse Index 패턴)
D) 별도 Lambda로 status = "ACTIVE" 항목만 복사 테이블에 저장한다

**정답: C**
해설: Sparse Index 패턴이다. status 속성을 GSI의 파티션 키로 사용하면 status 속성이 존재하는 항목만 GSI에 인덱싱된다. status가 없는 항목은 GSI에 나타나지 않는다. A는 FilterExpression이 이미 읽은 후 필터링이라 RCU 절감 없음. B도 같은 문제. D는 복잡도 증가와 데이터 동기화 문제. GSI Sparse Index는 "속성 존재 자체가 인덱싱 조건"이 되어 추가 코드 없이 효율적 필터링을 달성한다.

---

**문제 7.** DynamoDB Streams의 `NEW_AND_OLD_IMAGES` 뷰 타입을 사용하는 가장 적합한 시나리오는?

A) 새 항목 삽입 알림만 필요한 경우
B) 변경 전/후를 비교해 감사 로그를 기록하거나 변경 내용을 파악해야 하는 경우
C) 삭제된 항목의 키만 필요한 경우
D) 스토리지 비용을 최소화해야 하는 경우

**정답: B**
해설: `NEW_AND_OLD_IMAGES`는 변경 전후 전체 항목을 모두 기록하므로 "무엇이 어떻게 바뀌었는가"를 알 수 있다. 감사 로그, 변경 내역 추적, 특정 필드 변경 감지에 적합하다. 스토리지 비용 최소화에는 `KEYS_ONLY`(PK/SK만 기록)가 적합하다. 새 항목 삽입 후 처리에는 `NEW_IMAGE`로 충분하다. 삭제 후처리에는 `OLD_IMAGE`가 적합하다.

---

**문제 8.** 다음 중 DynamoDB TTL에 대한 올바른 설명을 모두 고르시오.

A) TTL 만료 항목이 Streams에 REMOVE로 기록될 때 `userIdentity.type = "Service"`로 식별된다
B) TTL 삭제는 WCU를 소비한다
C) TTL 속성값은 Unix epoch 초 단위 숫자여야 한다
D) TTL 만료 즉시 해당 항목은 Query/GetItem에서 보이지 않는다

**정답: A, C**
해설: A(맞음) — TTL 삭제를 일반 DeleteItem과 구분하려면 Stream 레코드의 `userIdentity` 필드를 확인한다. `type = "Service"`, `principalId = "dynamodb.amazonaws.com"`이면 TTL 삭제다. B(틀림) — TTL 삭제는 WCU를 소비하지 않아 비용 효율적이다. C(맞음) — 반드시 Unix epoch 초 단위 숫자. 밀리초나 ISO 날짜 문자열은 TTL로 인식되지 않는다. D(틀림) — TTL 만료 후 0~48시간 지연이 있어 만료된 항목이 여전히 조회될 수 있다.

---

**문제 9.** DynamoDB 테이블에 `orderId(PK)`, `createdAt(SK)`, `category`가 있다. "특정 category의 주문을 createdAt 오름차순으로 조회"하려 한다. 가장 효율적인 인덱스 설계는?

A) category를 PK로 하는 GSI 추가 (SK = createdAt)
B) 기본 테이블에서 Scan + FilterExpression (category = :c)
C) createdAt을 PK로 하는 GSI 추가
D) category에 LSI 추가 (SK = category)

**정답: A**
해설: GSI를 PK=category, SK=createdAt으로 구성하면 `Query(PK=category, ScanIndexForward=true)`로 특정 카테고리의 주문을 createdAt 오름차순으로 효율적으로 조회할 수 있다. B는 전체 테이블 Scan이라 비용이 크고 느리다. C는 createdAt이 PK면 시간대별 분산이 안 되고 정렬 조건도 활용 못한다. D는 LSI가 기본 테이블과 같은 PK(orderId)를 써야 하므로 category를 SK로 쓸 수는 있지만, orderId를 알아야만 조회 가능해 "특정 category 전체 조회"에 적합하지 않다.

---

**문제 10.** 전자상거래 플랫폼에서 주문 이벤트를 DynamoDB에 저장하고, 새 주문(INSERT) 시 실시간 알림을 보내야 한다. INSERT 이벤트만 처리하도록 Lambda를 구성하는 가장 효율적인 방법은?

A) Lambda 함수 코드에서 `eventName != "INSERT"`인 레코드를 건너뛴다
B) ESM `FilterCriteria`에서 `eventName = "INSERT"` 패턴을 설정한다
C) Streams를 두 개 만들어 INSERT 전용 스트림을 사용한다
D) 모든 이벤트를 SQS로 보내고 Lambda에서 필터링한다

**정답: B**
해설: ESM `FilterCriteria`는 DynamoDB Streams 이벤트를 Lambda 호출 전에 서버 사이드에서 필터링한다. INSERT만 필터링하면 MODIFY, REMOVE 이벤트는 Lambda 호출 자체가 발생하지 않아 Lambda 실행 비용이 줄고 처리 효율이 높아진다. A는 Lambda가 호출은 되되 코드에서 건너뛰는 방식이라 호출 비용이 발생한다. C는 DynamoDB Streams는 테이블당 하나다. D는 불필요한 구성 복잡도가 추가된다. Filter 패턴: `{"eventName": ["INSERT"]}`.

---

**문제 11.** DynamoDB TransactWriteItems에서 `ConditionCheck` 액션의 역할은?

A) 트랜잭션 내에서 항목을 조건부로 수정한다
B) 쓰기 없이 다른 테이블의 조건만 검사하고, 조건 불만족 시 전체 트랜잭션을 롤백한다
C) 트랜잭션 후 데이터 유효성을 검증한다
D) GSI의 조건을 체크한다

**정답: B**
해설: `ConditionCheck`는 트랜잭션 내에서 쓰기 없이 특정 항목의 조건만 검사하는 액션이다. 예를 들어 주문 생성 트랜잭션에서 사용자의 계정 상태가 ACTIVE인지 확인하고 싶을 때, Users 테이블을 수정하지 않고도 조건만 검사할 수 있다. 조건이 실패하면 `TransactionCanceledException`이 발생하고 전체 트랜잭션(다른 테이블의 Put/Update/Delete 포함)이 롤백된다. 이 액션이 없으면 트랜잭션 전에 별도 읽기를 해야 하고 TOCTOU 버그가 생길 수 있다.

---

**문제 12.** DynamoDB 단일 테이블 설계(Single-Table Design)에서 엔티티 타입별 쿼리를 지원하는 일반적인 패턴은?

A) 엔티티마다 별도 테이블을 만든다
B) GSI에서 파티션 키를 `entity_type` 속성으로 사용하는 Sparse Index 패턴
C) Scan + FilterExpression으로 타입 필터링
D) PartiQL SELECT로 WHERE entity_type = 'Order' 쿼리

**정답: B**
해설: Single-Table Design에서는 `PK = ENTITY_TYPE#id` 패턴과 함께 `entity_type` 속성에 타입을 저장하고, 이를 GSI 파티션 키로 사용한다. `Query GSI(PK = "ORDER")`면 모든 주문, `Query GSI(PK = "USER")`면 모든 사용자를 효율적으로 조회한다. C(Scan + Filter)는 테이블 전체를 읽어 비용이 크다. D(PartiQL)도 내부적으로 Scan을 수행할 수 있다. B의 GSI 패턴이 O(해당 타입 수)의 효율적 조회를 제공한다.

---
