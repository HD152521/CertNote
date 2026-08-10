# Day 3 - DynamoDB: RCU/WCU 수학, DAX 아키텍처, Streams 처리

DynamoDB 비용 청구서를 처음 받은 많은 개발자들이 충격을 받는다. 예상보다 10배, 100배 높은 금액이 나오는 이유는 대부분 세 가지다 — RCU/WCU 계산 실수, 온디맨드와 프로비저닝 모드 선택 오류, 미완료 작업으로 인한 낭비. 이 day에서는 RCU/WCU 계산을 수학적으로 정확하게 이해하고, DAX가 어떻게 캐시를 관리하는지, DynamoDB Streams가 어떻게 Lambda와 연동되는지를 파고든다.

## RCU 계산의 수학 — ceil 함수가 핵심

RCU(Read Capacity Unit) 계산 공식:

```
강력한 일관성 RCU = ceil(항목 크기 / 4KB) × 1
최종 일관성 RCU  = ceil(항목 크기 / 4KB) × 0.5
트랜잭션 RCU    = ceil(항목 크기 / 4KB) × 2
```

**ceil**은 올림 함수다. 항목이 4.1KB면 ceil(4.1/4) = ceil(1.025) = 2다.

시험에 자주 나오는 RCU 계산 예시들:

```
예시 1: 1KB 항목, 최종 일관성 읽기 100회/초
  RCU = ceil(1/4) × 0.5 × 100 = 1 × 0.5 × 100 = 50 RCU

예시 2: 6KB 항목, 강력한 일관성 읽기 50회/초
  RCU = ceil(6/4) × 1 × 50 = 2 × 1 × 50 = 100 RCU

예시 3: 9KB 항목, 트랜잭션 읽기 20회/초
  RCU = ceil(9/4) × 2 × 20 = 3 × 2 × 20 = 120 RCU

예시 4: 400KB 항목 (최대 크기), 최종 일관성 10회/초
  RCU = ceil(400/4) × 0.5 × 10 = 100 × 0.5 × 10 = 500 RCU
```

## WCU 계산의 수학

WCU(Write Capacity Unit) 계산 공식:

```
일반 쓰기 WCU      = ceil(항목 크기 / 1KB)
트랜잭션 쓰기 WCU  = ceil(항목 크기 / 1KB) × 2
```

WCU는 1KB 기준이다 — RCU의 4KB와 다르다. 이 차이를 놓치면 계산이 틀린다.

```
예시 1: 2.5KB 항목, 일반 쓰기 초당 10회
  WCU = ceil(2.5/1) × 1 × 10 = 3 × 10 = 30 WCU

예시 2: 0.5KB 항목, 트랜잭션 쓰기 초당 50회
  WCU = ceil(0.5/1) × 2 × 50 = 1 × 2 × 50 = 100 WCU

예시 3: 7KB 항목, 일반 쓰기 초당 5회
  WCU = ceil(7/1) × 1 × 5 = 7 × 5 = 35 WCU
```

> ⚠️ **함정**: WCU는 1KB 단위, RCU는 4KB 단위다. 혼동하면 계산이 4배 틀린다. "쓰기는 더 비싸다"고 외우자 — 같은 항목에 대해 WCU는 RCU(강력한 일관성)보다 4배 많은 용량 단위를 소비한다.

## 온디맨드 vs 프로비저닝 — 선택 기준의 수학

| 구분 | 프로비저닝 + Auto Scaling | 온디맨드 |
|------|------------------------|---------|
| 가격 | 프로비저닝 RCU/WCU 시간당 과금 | 실제 요청 건당 과금 |
| 가격 비율 | 기준 | 약 2~3배 비쌈 |
| 예측성 | 예측 가능한 트래픽에 유리 | 예측 불가 트래픽에 유리 |
| 관리 | Auto Scaling 정책 설정 필요 | 설정 없음 |
| 최대 처리량 | 설정값 | 이전 피크의 2배 (예열됨) |
| 모드 전환 | 온디맨드로 1회/24시간 | 프로비저닝으로 1회/24시간 |

온디맨드가 적합한 상황: ① 신규 서비스(트래픽 예측 불가), ② 배치 작업(불규칙적 대량 처리), ③ 개발/테스트 환경, ④ 트래픽 패턴이 완전히 랜덤.

프로비저닝이 적합한 상황: ① 안정적이고 예측 가능한 트래픽, ② 비용 최적화가 중요한 대규모 서비스, ③ Reserved Capacity(약 76% 할인)를 사용하는 경우.

> ⚠️ **함정**: 온디맨드 모드는 무한히 확장하지 않는다. 처음 설정 시 최소 처리량에서 시작하고, 이전 트래픽 피크의 2배까지만 자동 확장된다. 따라서 갑자기 10배 트래픽이 몰리면 예열되지 않은 온디맨드 테이블에서도 throttling이 발생한다. 예열 방법: 일정 기간 프로비저닝 모드로 운영해 충분한 트래픽을 처리한 후 온디맨드로 전환한다.

## DAX 아키텍처 — Write-Through Cache의 의미

DAX(DynamoDB Accelerator)는 DynamoDB 전용 인메모리 캐시다. 응답 시간을 밀리초(ms)에서 마이크로초(μs)로 줄인다.

DAX는 완전 관리형 클러스터로 구성된다. 클러스터는 하나의 Primary 노드와 여러 Read Replica 노드로 이루어진다. 클라이언트는 DynamoDB SDK 대신 DAX SDK를 사용하지만 API는 동일하다.

**DAX의 두 가지 캐시**:

```
1. Item Cache (항목 캐시)
   - 대상: GetItem, BatchGetItem 결과
   - TTL: 기본 5분 (조정 가능)
   - 캐시 미스 시: DynamoDB에서 읽어 캐시에 저장 후 반환

2. Query Cache (쿼리 캐시)
   - 대상: Query, Scan 결과
   - TTL: 기본 5분 (조정 가능)
   - 동일한 파라미터로 동일한 쿼리 실행 시 캐시 반환
   - 캐시 키: 테이블명 + 파라미터 전체 해시
```

**DAX 읽기 흐름**:
```
클라이언트 → DAX 클러스터
                ↓ 캐시 히트?
                YES → 캐시에서 즉시 반환 (~μs)
                NO  → DynamoDB에서 읽기 → 캐시 저장 → 반환 (~ms)
```

**DAX 쓰기 흐름 (Write-Through)**:
```
클라이언트 → DAX 클러스터
                ↓
                DynamoDB에 쓰기 (동기)
                ↓
                Item Cache 업데이트
                ↓
                완료 반환
```

Write-Through의 의미: DAX에 쓰기 요청이 들어오면 DAX는 DynamoDB에 먼저 쓰고, 성공 후 캐시도 업데이트한다. 쓰기가 캐시에만 저장되는 Write-Back과 달리 데이터 손실 위험이 없다.

> 💡 **관련 이론**: 캐시 전략의 세 가지 유형 — Lazy Loading(Cache-Aside): 캐시 미스 시 애플리케이션이 DB에서 읽어 캐시에 저장. Write-Through: 쓰기 시 캐시와 DB를 동시에 업데이트. Write-Back(Write-Behind): 쓰기가 캐시에만 되고 나중에 비동기로 DB에 반영. DAX는 읽기에서 Lazy Loading, 쓰기에서 Write-Through를 사용한다. ElastiCache는 세 전략을 모두 구현 가능하지만 개발자가 직접 캐시 로직을 코딩해야 한다.

**DAX의 중요한 제약사항**:

1. **강력한 일관성 읽기는 캐시를 우회한다** — `ConsistentRead: true`로 요청하면 DAX가 직접 DynamoDB에 쿼리한다. 항상 최신 데이터가 필요한 경우 DAX의 혜택을 받지 못한다.

2. **VPC 내부에서만 사용 가능** — DAX 클러스터에 ENI가 생성되고 VPC 안에서만 접근 가능하다. 인터넷에서 직접 접근 불가.

3. **쓰기 성능 향상 없음** — DAX는 읽기 캐시다. 쓰기는 항상 DynamoDB를 거친다.

## DAX vs ElastiCache — 언제 무엇을 쓰는가

| 항목 | DAX | ElastiCache(Redis) |
|------|-----|-------------------|
| 대상 데이터 | DynamoDB 전용 | 모든 데이터 |
| API 호환성 | DynamoDB SDK와 동일 | 별도 Redis/Memcached API |
| 캐시 로직 | 자동 (투명) | 개발자가 직접 구현 |
| TTL 관리 | 자동 (DAX가 처리) | 개발자가 설정 |
| 캐시 무효화 | DAX가 쓰기 시 자동 | 개발자가 직접 삭제 |
| 사용 사례 | DynamoDB 읽기 가속 | 세션 관리, Pub/Sub, 복잡한 캐싱 |
| 비용 | DAX 노드 시간당 요금 | ElastiCache 노드 시간당 요금 |

시험 시나리오: "DynamoDB 읽기 응답이 ms 수준인데 μs 수준으로 줄이고 싶다" → DAX. "세션 데이터를 빠르게 저장하고 싶다" → ElastiCache Redis. "DynamoDB와 무관하게 다양한 DB를 캐싱하고 싶다" → ElastiCache.

> 📚 **사례**: Netflix는 DynamoDB를 사용자 시청 기록과 추천 데이터 저장에 사용하고, DAX를 그 앞단에 두어 같은 에피소드 목록에 반복적으로 접근하는 패턴을 캐싱한다. 넷플릭스 내부 발표에 따르면 피크 타임에 DynamoDB 읽기의 70% 이상이 DAX 캐시 히트로 처리되며, 이를 통해 DynamoDB 프로비저닝 비용을 크게 줄인다.

## DynamoDB Streams — 변경 이력의 실시간 스트리밍

DynamoDB Streams는 테이블의 모든 항목 변경(INSERT, MODIFY, REMOVE)을 순서대로 기록하는 시간 순서 변경 로그다.

**Streams의 내부 구조**:
- 각 테이블 파티션마다 하나의 Stream 샤드가 존재
- 파티션 키 단위로 이벤트 순서 보장
- 24시간 보존 (고정, 변경 불가)
- Lambda 또는 KCL(Kinesis Client Library)로 소비

**스트림 뷰 유형 4가지**:

```
KEYS_ONLY:          변경된 항목의 PK와 SK만 기록
NEW_IMAGE:          변경 후 전체 항목
OLD_IMAGE:          변경 전 전체 항목
NEW_AND_OLD_IMAGES: 변경 전/후 모두 (감사 로그용)
```

**Lambda + Streams 연동 방식**:

Lambda는 Streams를 **이벤트 소스 매핑(Event Source Mapping, ESM)**으로 폴링한다. Lambda가 Streams를 주기적으로 확인하는 것이지, Streams가 Lambda를 직접 호출하는 게 아니다.

```python
# Lambda 함수 핸들러 (DynamoDB Streams 이벤트 처리)
def handler(event, context):
    for record in event['Records']:
        event_name = record['eventName']  # INSERT, MODIFY, REMOVE
        
        if event_name == 'INSERT':
            new_item = record['dynamodb']['NewImage']
            # 새 항목 처리
            
        elif event_name == 'MODIFY':
            old_item = record['dynamodb']['OldImage']
            new_item = record['dynamodb']['NewImage']
            # 변경 전/후 비교 처리
            
        elif event_name == 'REMOVE':
            old_item = record['dynamodb']['OldImage']
            # 삭제된 항목 처리
```

| ESM 설정 | 설명 |
|---------|------|
| BatchSize | 한 번에 처리할 레코드 수 (최대 10,000) |
| BisectBatchOnFunctionError | 오류 시 배치를 반으로 분할해 재시도 |
| DestinationConfig | 실패 레코드를 SQS DLQ나 SNS로 전송 |
| MaximumRetryAttempts | 최대 재시도 횟수 |
| ParallelizationFactor | 샤드당 병렬 Lambda 수 (기본 1, 최대 10) |

**샤드당 하나의 Lambda**: 기본적으로 하나의 Stream 샤드는 하나의 Lambda 인스턴스가 순서대로 처리한다. `ParallelizationFactor`를 높이면 하나의 샤드를 여러 Lambda가 병렬로 처리할 수 있지만, 이 경우 파티션 키 단위 순서 보장이 복잡해진다.

## Kinesis Data Streams for DynamoDB — 24시간 한도 극복

DynamoDB Streams의 유일한 큰 단점은 **24시간 보존** 한도다. 1년치 변경 이력이 필요하다면 DynamoDB Streams가 아니라 Kinesis Data Streams를 사용해야 한다.

DynamoDB 테이블을 Kinesis Data Streams와 직접 연결하면 모든 변경 사항이 Kinesis 스트림으로 흘러간다. Kinesis는 최대 **365일** 보존이 가능하다.

```
DynamoDB Table
    ↓ (직접 연결, 추가 코드 없음)
Kinesis Data Stream
    ↓ (최대 365일 보존)
    ├── Lambda (실시간 처리)
    ├── Kinesis Firehose → S3 (장기 보존)
    └── Kinesis Analytics (실시간 분석)
```

시험 시나리오: "DynamoDB 변경 이력을 1년 이상 보존해야 한다" → Kinesis Data Streams for DynamoDB.

## Global Tables — 다중 리전 Active-Active

Global Tables는 여러 리전에 DynamoDB 테이블의 복제본을 만들어 각 리전에서 읽기/쓰기가 가능한 Active-Active 패턴이다.

```
ap-northeast-2 테이블 ←→ us-east-1 테이블 ←→ eu-west-1 테이블
(서울에서 쓰기)         (버지니아에서 쓰기)   (아일랜드에서 쓰기)
        ↕ 비동기 복제 (Streams 기반)
모든 리전에 최종적 일관성으로 동기화
```

Global Tables 요건: ① DynamoDB Streams 활성화 필수, ② 온디맨드 또는 동일한 프로비저닝 용량.

충돌 해결: 두 리전에서 동시에 같은 항목을 수정하면 **Last Writer Wins(마지막 쓰기 우선)** 방식으로 해결한다. 가장 최근 타임스탬프의 쓰기가 최종 값이 된다.

> ⚠️ **함정**: Global Tables에서 강력한 일관성 읽기를 요청하면 현재 리전의 로컬 복제본에서만 강력한 일관성이 보장된다. 다른 리전의 쓰기가 아직 복제되지 않았다면 로컬 강력한 일관성 읽기도 다른 리전의 최신 데이터를 포함하지 않는다.

## PITR(Point-In-Time Recovery) — 35일 롤백 창

PITR은 DynamoDB 테이블을 지난 35일 중 임의의 시점으로 복원할 수 있는 백업 기능이다.

```
활성화: 테이블 단위로 PITR 활성화
복원: 지난 35일 내 초 단위로 특정 시점 선택
대상: 새 테이블로 복원 (기존 테이블 덮어쓰지 않음)
비용: 저장 GB당 추가 과금
```

PITR은 On-Demand Backup과 다르다. On-Demand Backup은 수동으로 특정 시점의 스냅샷을 생성하고 무기한 보존한다. PITR은 자동이지만 35일 창 내에서만 복원 가능하다.

시험 시나리오: "실수로 대량의 데이터를 삭제했다, 어제 상태로 복원하고 싶다" → PITR. "규정상 백업을 5년 보존해야 한다" → On-Demand Backup + S3 Export.

## 테이블 용량은 어떻게 파티션으로 쪼개지는가

RCU/WCU 계산을 아무리 정확히 해도 스로틀링을 만나는 이유는, **테이블에 설정한 용량이 파티션들에 나뉘어 배분되기 때문**이다. 청구서에 찍히는 숫자는 테이블 단위지만, 실제로 요청을 처리하는 주체는 파티션 하나하나다.

```
테이블: 프로비저닝 4,000 RCU / 4,000 WCU
        ↓ DynamoDB가 내부적으로 파티션에 나눔
   ┌──────────┬──────────┬──────────┬──────────┐
   │ 파티션 A │ 파티션 B │ 파티션 C │ 파티션 D │
   │ ~1000RCU │ ~1000RCU │ ~1000RCU │ ~1000RCU │
   └──────────┴──────────┴──────────┴──────────┘
        ▲
        └─ 요청이 여기에만 몰리면?
           테이블 전체 4,000 RCU 중 900만 쓰고 있어도
           파티션 A에서만 ProvisionedThroughputExceededException

   파티션 하나의 물리적 상한: 약 3,000 RCU · 1,000 WCU · 10GB
```

여기서 두 가지 완충 장치를 알아 둬야 한다.

- **버스트 용량(Burst Capacity)**: 최근 **최대 300초(5분)** 동안 쓰지 않고 남긴 용량을 모아 두었다가 순간적인 스파이크에 쓴다. 짧은 튐은 이걸로 넘어간다. 다만 저축이므로 계속 쓸 수는 없고, AWS가 보장하는 자원도 아니다.
- **적응형 용량(Adaptive Capacity)**: 특정 파티션에 부하가 몰리면 DynamoDB가 다른 파티션의 여유 용량을 그쪽으로 밀어 준다. 자동으로 동작하지만 **편향이 극심하면 이것도 한계**에 부딪힌다.

> ⚠️ **함정**: "스로틀링이 나면 용량을 올린다"는 반사 행동이 가장 비싼 오답이다. 편향이 원인이면 용량을 두 배로 올려도 파티션 하나에 배정되는 몫은 그만큼 늘지 않고, 요금만 두 배가 된다. **CloudWatch에서 소비 용량이 프로비저닝 용량에 한참 못 미치는데도 `ThrottledRequests`가 잡히면 그것은 용량 문제가 아니라 키 설계 문제다.** 이때의 처방은 (1) 파티션 키의 카디널리티를 높이거나, (2) write sharding으로 인위적으로 흩거나, (3) 뜨거운 항목을 DAX·ElastiCache로 앞에서 흡수하는 것이다.

```bash
# 현재 테이블의 용량 모드·인덱스·크기를 한눈에
aws dynamodb describe-table --table-name Orders \
  --query 'Table.{Mode:BillingModeSummary.BillingMode,Items:ItemCount,SizeBytes:TableSizeBytes,GSI:GlobalSecondaryIndexes[].IndexName}'

# 온디맨드로 전환 (24시간에 1회 제한 — 시험 단골 숫자)
aws dynamodb update-table --table-name Orders --billing-mode PAY_PER_REQUEST

# 프로비저닝으로 되돌리며 GSI 용량도 함께 지정 (GSI를 빠뜨리면 GSI가 병목이 된다)
aws dynamodb update-table --table-name Orders \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=2000,WriteCapacityUnits=2000 \
  --global-secondary-index-updates '[{"Update":{"IndexName":"StatusIndex",
      "ProvisionedThroughput":{"ReadCapacityUnits":2000,"WriteCapacityUnits":2000}}}]'

# 스로틀 지표를 먼저 본다 — 로그보다 이쪽이 훨씬 빠르다
aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests --dimensions Name=TableName,Value=Orders \
  --start-time 2026-06-27T00:00:00Z --end-time 2026-06-27T12:00:00Z \
  --period 300 --statistics Sum
```

## 배치 API와 부분 실패 — 조용히 데이터를 잃는 자리

DynamoDB의 배치 API는 "전부 성공 아니면 전부 실패"가 아니다. **일부만 처리되고 나머지를 돌려주는** 구조이며, 이 반환값을 무시하는 코드가 실무에서 데이터 유실을 만든다.

| API | 한 번에 | 성격 | 실패 처리 |
|-----|--------|------|----------|
| `GetItem` | 항목 1개 | 키로 정확히 하나 | 예외 |
| `BatchGetItem` | **최대 100개 · 16MB** | 여러 테이블에서 병렬 조회 | **`UnprocessedKeys` 반환** |
| `BatchWriteItem` | **최대 25개 · 16MB** | Put/Delete만 (**Update 불가**) | **`UnprocessedItems` 반환** |
| `TransactWriteItems` | 최대 100개 · 4MB | 전부 성공 or 전부 실패 | 예외(취소 사유 포함), **WCU 2배** |
| `Query` | 1MB 페이지 | 키 조건으로 범위 조회 | `LastEvaluatedKey` |
| `Scan` | 1MB 페이지 | 전체 훑기 | `LastEvaluatedKey` |

```python
import time, random
from botocore.exceptions import ClientError

def batch_write_all(dynamodb, table_name: str, items: list) -> None:
    """25개씩 끊어 쓰되, 처리되지 않은 항목은 지수 백오프로 재시도한다."""
    for i in range(0, len(items), 25):
        request = {
            table_name: [{"PutRequest": {"Item": it}} for it in items[i:i + 25]]
        }
        attempt = 0
        while request:
            response = dynamodb.batch_write_item(RequestItems=request)
            request = response.get("UnprocessedItems") or {}   # ← 이걸 버리면 데이터가 사라진다

            if request:
                attempt += 1
                if attempt > 8:
                    raise RuntimeError(f"batch write gave up: {len(request[table_name])} items left")
                # 지수 백오프 + 지터: 재시도가 동시에 몰려 다시 스로틀되는 것을 막는다
                time.sleep(min(2 ** attempt * 0.05, 5) * (0.5 + random.random()))
```

`UnprocessedItems`가 비어 있지 않다는 것은 **에러가 아니라 스로틀링의 정상적인 표현**이다. 예외가 던져지지 않으므로 `try/except`만 걸어 둔 코드는 아무 경고 없이 항목을 흘린다. "배치 업로드했는데 몇 건이 없다"는 신고의 1순위 원인이 정확히 이것이다.

| 에러/신호 | 뜻 | 처방 |
|----------|-----|------|
| `ProvisionedThroughputExceededException` | 용량 초과 | 지수 백오프 재시도, 용량·키 설계 점검 |
| `UnprocessedItems` / `UnprocessedKeys` (비어 있지 않음) | 부분 스로틀 | **반드시 재시도** (예외 아님) |
| `ConditionalCheckFailedException` | 조건 불충족 | 재조회 후 재시도 (설계된 신호) |
| `TransactionCanceledException` | 트랜잭션 취소 | `CancellationReasons`로 어느 항목이 걸렸는지 확인 |
| `ValidationException` | 항목 400KB 초과·키 누락·예약어 | 요청 구조 점검 |
| `ItemCollectionSizeLimitExceededException` | LSI 항목 컬렉션 10GB 초과 | LSI 대신 GSI로 재설계 |
| `IteratorAge` 지표 상승 | Streams 소비가 뒤처짐 | 병렬화·배치 크기·함수 성능 점검 |

> 💡 **관련 이론**: 지수 백오프에 **지터(jitter, 무작위 흔들림)** 를 섞는 이유는 **동기화된 재시도(thundering herd)** 를 깨기 위해서다. 스로틀을 만난 클라이언트 수백 개가 정확히 같은 간격으로 재시도하면, 그 시각에 다시 부하가 모여 또 스로틀이 나고, 이 진동이 계속된다. 대기 시간에 무작위성을 넣으면 재시도가 시간축에 흩어져 시스템이 스스로 빠져나올 수 있다. AWS SDK는 기본적으로 이 전략을 내장하고 있으므로, 직접 재시도 루프를 짤 때만 신경 쓰면 된다 — "SDK 기본 재시도를 끄고 직접 짠다"는 보기가 시험에서 잘 안 보이는 이유이기도 하다.

## DAX가 오래된 값을 주는 순간

DAX의 Write-Through는 "**DAX를 통해 쓴 경우에만**" 캐시를 갱신한다. 이 전제를 놓치면 원인을 알 수 없는 오래된 데이터를 만난다.

```
[정상 경로]                          [캐시가 뒤처지는 경로]
앱 → DAX → DynamoDB                  다른 서비스 → DynamoDB (DAX 우회)
      └ 캐시 갱신 ✅                         └ DAX는 이 변경을 모른다 ❌
                                              TTL(기본 5분)이 지나야 새 값

  예) 배치 작업·Lambda·콘솔에서 직접 테이블을 수정
     → DAX를 쓰는 앱은 최대 TTL 만큼 옛 값을 본다
```

이 상황의 처방은 세 가지다. (1) **모든 쓰기를 DAX를 통해** 보내도록 경로를 통일하거나, (2) 최신성이 반드시 필요한 읽기는 `ConsistentRead: true`로 요청해 캐시를 우회하거나(대신 DAX의 성능 이득은 포기), (3) TTL을 업무가 감내할 수 있는 수준으로 줄이는 것이다. 어느 쪽이든 "DAX를 붙였으니 자동으로 항상 최신"이라는 기대는 성립하지 않는다.

> 🔍 **더 깊이**: DAX가 굳이 **자체 SDK**를 요구하는 이유는 클라이언트가 클러스터 토폴로지를 알아야 하기 때문이다. DAX SDK는 클러스터의 노드 목록을 받아 읽기를 리드 리플리카들에 분산하고, 쓰기는 프라이머리로 보내며, 노드가 교체되면 목록을 갱신한다. API 시그니처는 DynamoDB와 같아서 코드 변경이 거의 없지만 **연결 계층은 완전히 다른 물건**인 셈이다. 그래서 DAX는 VPC 안에서만 접근 가능하고(클러스터 노드에 ENI가 붙는다), Lambda에서 쓰려면 그 Lambda도 같은 VPC에 배치해야 한다 — "DAX를 붙였는데 Lambda가 타임아웃"의 상당수가 이 VPC 설정 누락이다.

## Streams 소비가 막히는 자리: 독약 메시지

Streams와 Lambda의 조합에서 가장 아픈 장애는 **샤드 블로킹**이다. 순서를 보장하려면 실패한 배치를 건너뛸 수 없으므로, 한 레코드가 계속 실패하면 그 샤드 뒤의 모든 레코드가 멈춘다.

```
샤드 1: [R1][R2][R3(항상 실패)][R4][R5][R6] ...
                    ▲
                    └ 여기서 계속 재시도 → R4 이후는 영원히 처리되지 않음
                      CloudWatch의 IteratorAge가 계속 상승 = 이 상태의 신호
```

이벤트 소스 매핑의 설정들은 사실상 전부 이 문제를 다루기 위한 손잡이다.

| 설정 | 하는 일 | 언제 쓰나 |
|------|--------|----------|
| `BisectBatchOnFunctionError` | 실패한 배치를 반으로 쪼개 재시도 | 배치 안 어느 레코드가 문제인지 좁힐 때 |
| `MaximumRetryAttempts` | 재시도 횟수 상한 | 무한 재시도로 샤드가 막히는 것을 방지 |
| `MaximumRecordAgeInSeconds` | 너무 오래된 레코드는 버림 | 밀린 데이터가 무의미해지는 실시간 처리 |
| `DestinationConfig`(실패 대상) | 포기한 배치 정보를 SQS/SNS로 | 나중에 사람이 조사하도록 격리 |
| `ParallelizationFactor` | 샤드 하나를 최대 10개 Lambda로 | 처리량은 늘지만 순서 보장이 복잡해짐 |
| `BatchSize` | 한 번에 넘길 레코드 수 | 처리량과 실패 폭발 반경의 균형 |

> 📚 **사례**: 주문 테이블의 Streams로 검색 인덱스를 갱신하던 파이프라인이, 어느 날 유니코드 이모지가 포함된 상품명 때문에 인덱싱 라이브러리에서 예외를 던지며 멈춘 사례가 있다. 함수는 그 레코드에서 계속 실패했고, 순서를 지키느라 뒤의 수만 건이 통째로 대기하면서 검색 결과가 몇 시간 동안 옛 상태로 굳었다. 지표상 유일한 신호는 `IteratorAge`의 단조 상승뿐이었다 — 에러율은 낮고(같은 한 건만 실패), 호출 수도 정상으로 보였기 때문이다. 이후 처방은 교과서적이다: **`MaximumRetryAttempts`로 포기 지점을 정하고, `DestinationConfig`로 실패 배치를 SQS에 격리하며, `IteratorAge`에 알람을 건다.** 그리고 핸들러는 개별 레코드를 `try/except`로 감싸 "처리 불가능한 데이터"와 "일시적 장애"를 구분하게 바꿨다. 스트림 처리에서 알람을 걸 지표를 하나만 고르라면 답은 언제나 `IteratorAge`다.

오늘의 핵심 — RCU/WCU 수학은 시험에서 거의 매번 나오는 계산 문제다. 공식을 외우지 말고 "읽기는 4KB 기준, 쓰기는 1KB 기준, ceil로 올림"이라는 원리를 이해하자. DAX는 DynamoDB 읽기를 μs로 줄이는 투명한 캐시이고, Streams는 모든 변경을 24시간 보존하는 변경 로그다.

## 한 줄 요약

DynamoDB의 비용과 장애는 대부분 **"내가 설정한 용량"과 "실제로 부하를 받는 파티션" 사이의 간극**에서 태어난다. 계산은 읽기 4KB·쓰기 1KB·올림이라는 세 단어로 끝나지만, 그 계산이 맞아떨어지려면 트래픽이 파티션에 고르게 퍼져 있어야 한다. DAX는 그 간극을 앞에서 흡수하는 캐시이되 DAX를 우회한 쓰기는 보지 못하고, Streams는 모든 변경을 24시간 순서대로 남기되 실패한 레코드 하나가 샤드를 막을 수 있다. 세 주제 모두 **"평균은 괜찮은데 한 지점이 터진다"** 는 같은 형태의 문제를 다루고 있으며, 시험이 묻는 것도 정확히 그 지점이다.

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

**정답: C**
해설: 트랜잭션 쓰기 WCU = ceil(항목 크기 / 1KB) × 2 × 초당 요청 수. ceil(3.5/1) = 4. 4 × 2 × 20 = 160... 아, 다시 계산: 4 × 2 = 8, 8 × 20 = 160이 되어야 하는데 정답이 C(140)다. 재확인: 트랜잭션 WCU = ceil(3.5/1) = 4, ×2 = 8, ×20 = 160. 그러나 문제의 정답을 C(140)로 제시했으나 실제 정확한 계산은 160 RCU다. 수정: **정답: D(160 WCU)**. ceil(3.5/1) = 4, ×2(트랜잭션) = 8 WCU/요청, ×20초당 = 160 WCU. 일반 쓰기라면 ceil(3.5/1)×1×20 = 80 WCU였다.

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
