# Day 2 - Lambda 이벤트 소스 매핑: SQS·Kinesis·DynamoDB Streams 내부 폴링 메커니즘

Lambda 함수는 "누군가 호출해야 실행된다"는 원칙에서 출발한다. 그 "누군가"가 누구인지에 따라 Lambda의 동작 방식 — 재시도 횟수, 에러 처리, 순서 보장 여부 — 이 완전히 달라진다. 이걸 이해하지 못하면 SQS 메시지가 무한 반복 처리되거나, Kinesis 샤드가 통째로 막히거나, S3 처리가 무한 루프에 빠지는 사고를 당한다.

Lambda의 호출 방식은 세 가지 범주로 나뉜다. 첫째, **동기 호출(Synchronous Invocation)**: 호출자가 직접 `InvokeFunction` API를 `RequestResponse` 모드로 부른다. API Gateway, ALB, Cognito가 여기 속한다. 둘째, **비동기 호출(Asynchronous Invocation)**: 이벤트가 Lambda 서비스의 내부 큐에 들어가고 Lambda가 0~2회 재시도한다. S3, SNS, EventBridge가 여기 속한다. 셋째, **이벤트 소스 매핑(Event Source Mapping, ESM)**: Lambda 서비스 자체가 소스를 능동적으로 폴링한다. SQS, Kinesis, DynamoDB Streams, MSK, Apache Kafka가 여기 속한다.

## 동기 호출의 내부 동작: 재시도는 호출자 책임

API Gateway → Lambda 경로를 따라가면 이 흐름이 보인다. 클라이언트가 REST API 요청을 보내면, API Gateway는 `lambda:InvokeFunction`을 `InvocationType=RequestResponse`로 호출한다. Lambda 서비스는 요청을 받아 실행 환경에 전달하고, 함수가 반환할 때까지 블록된 상태로 대기한다. 응답이 오면 API Gateway가 HTTP 응답으로 변환해 클라이언트에 돌려준다.

동기 호출에서 함수가 에러를 던지면 Lambda는 HTTP 200 OK 응답을 주지만, `FunctionError` 헤더를 붙인다. 응답 페이로드는 에러 메시지를 담은 JSON이다. **재시도는 호출자의 책임**이다 — API Gateway는 기본적으로 재시도하지 않는다.

```python
import boto3
import json

lambda_client = boto3.client('lambda')

response = lambda_client.invoke(
    FunctionName='my-function',
    InvocationType='RequestResponse',
    Payload=json.dumps({'key': 'value'}).encode()
)

# HTTP 200이어도 함수 내부 에러일 수 있음
if 'FunctionError' in response:
    error = json.loads(response['Payload'].read())
    print(f"함수 에러: {error['errorMessage']}")  # 재시도는 이 코드가 결정
else:
    result = json.loads(response['Payload'].read())
```

> 💡 **관련 이론**: 동기 호출의 에러 처리 모델은 분산 시스템의 **Fail-Fast** 패턴이다. 에러를 호출자에게 즉시 돌려주므로 호출자가 회로 차단기(Circuit Breaker, Netflix Hystrix, AWS App Mesh 등)를 구현할 수 있다. 비동기 호출처럼 내부에서 자동 재시도가 일어나지 않으므로 부작용(side effect)이 없고, 멱등성 요구가 낮다.

## 비동기 호출: Lambda 내부 큐와 재시도 메커니즘

S3 버킷에 파일이 업로드되면 S3가 `InvocationType=Event`로 Lambda를 호출한다. Lambda 서비스는 이벤트를 즉시 내부 이벤트 큐(SQS와 유사하지만 외부에서 보이지 않는 내부 큐)에 넣고 S3에 202 Accepted를 반환한다. S3는 함수가 실제로 실행됐는지, 성공했는지 알지 못한다.

Lambda 서비스는 큐에서 이벤트를 꺼내 함수를 실행하고, 실패하면 최대 2회 재시도한다. 재시도 간격은 1분, 2분으로 지수 백오프다. 그래도 실패하면 설정된 DLQ나 Destination으로 이벤트를 전송한다.

| 항목 | DLQ | Lambda Destinations |
|------|-----|---------------------|
| 성공 이벤트 처리 | ❌ | ✅ (OnSuccess) |
| 실패 이벤트 처리 | ✅ | ✅ (OnFailure) |
| 대상 서비스 | SQS, SNS | SQS, SNS, EventBridge, Lambda |
| 컨텍스트 정보 | 기본 페이로드만 | 요청, 응답, 에러 전체 메타데이터 |
| AWS 권장 여부 | 레거시 | ✅ 권장 |

```bash
# Destination 설정 (성공 + 실패 모두)
aws lambda put-function-event-invoke-config \
  --function-name image-processor \
  --maximum-retry-attempts 2 \
  --maximum-event-age-in-seconds 3600 \
  --destination-config '{
    "OnSuccess": {
      "Destination": "arn:aws:sqs:ap-northeast-2:123:success-audit-queue"
    },
    "OnFailure": {
      "Destination": "arn:aws:events:ap-northeast-2:123:event-bus/ops-bus"
    }
  }'
```

> ⚠️ **함정**: 비동기 호출에서 Lambda는 같은 이벤트를 최대 3번(원본 + 2회 재시도) 실행할 수 있다. 이는 **at-least-once delivery** 보장이다. 함수가 멱등적(idempotent)이지 않으면 중복 처리 문제가 생긴다. 예를 들어 "사용자에게 이메일 보내기" 함수가 비동기로 호출되고 두 번 성공하면 이메일이 두 통 간다.

> 📚 **사례**: 2021년 Stripe는 웹훅 이벤트 처리를 Lambda 비동기로 구현했다가 중복 처리 문제를 겪었다. 결제 금액이 두 번 차감되는 사고가 발생했고, 이후 Lambda Powertools의 Idempotency 모듈을 도입해 DynamoDB에 이벤트 ID를 저장하고 중복 호출을 차단했다. 이 교훈은 "Lambda 비동기 + 상태 변경 작업 = 반드시 멱등성 구현"으로 정리된다.

## S3 이벤트: 비동기 호출과 무한 루프 방지

S3 이벤트 알림은 두 가지 방식이 있다.

**S3 Event Notifications(레거시)**: 버킷 설정에서 직접 Lambda, SQS, SNS로 이벤트를 발송한다. 간단하지만 필터링이 prefix/suffix 정도에 그치고, 하나의 이벤트 타입에 하나의 대상만 설정 가능하다.

**S3 → EventBridge(현재 권장)**: EventBridge를 경유해 더 세밀한 패턴 매칭, 여러 대상으로 팬아웃, 이벤트 아카이브와 리플레이가 가능하다.

S3 이벤트를 처리할 때 가장 흔한 사고는 무한 루프다.

```
[원본 버킷] 파일 업로드 → Lambda 실행 → 처리 결과를 [같은 버킷]에 저장
    ↑                                                              ↓
    └──────────────── 새 업로드 이벤트 발생 → Lambda 재실행 ────────┘
```

**해결책 3가지:**

1. **입출력 버킷 분리**: 처리 결과를 다른 버킷에 저장한다.
2. **Prefix/Suffix 필터**: `input/` 폴더 업로드만 트리거하도록 설정하고, 결과는 `output/`에 저장.
3. **객체 태그 검사**: 처리된 객체에 `processed=true` 태그를 달고, 함수가 이 태그를 먼저 확인한 뒤 건너뛴다.

```python
def lambda_handler(event, context):
    s3 = boto3.client('s3')
    for record in event['Records']:
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        
        # 이미 처리된 객체인지 확인 (방어 로직)
        try:
            tags = s3.get_object_tagging(Bucket=bucket, Key=key)
            for tag in tags['TagSet']:
                if tag['Key'] == 'processed' and tag['Value'] == 'true':
                    print(f"이미 처리된 객체 건너뜀: {key}")
                    return
        except Exception:
            pass
        
        # 처리 로직
        process_object(bucket, key)
        
        # 처리 완료 태그 추가
        s3.put_object_tagging(
            Bucket=bucket, Key=key,
            Tagging={'TagSet': [{'Key': 'processed', 'Value': 'true'}]}
        )
```

## SQS Event Source Mapping: Lambda가 능동적으로 폴링

SQS와 Lambda의 통합은 처음 보면 직관에 반한다. SQS가 Lambda를 호출하는 게 아니라, **Lambda 서비스가 SQS를 폴링**한다. 이게 이벤트 소스 매핑(ESM)의 핵심이다.

Lambda 서비스는 SQS 큐를 롱 폴링(Long Polling, 최대 20초 대기)으로 메시지를 가져온다. 배치로 묶어서 함수를 호출하며, 함수가 성공하면 메시지를 삭제한다. 실패하면 가시성 타임아웃(Visibility Timeout)이 끝난 후 메시지가 큐에 다시 나타난다. `maxReceiveCount`(기본 3)를 초과하면 SQS DLQ로 이동한다.

**핵심 ESM 파라미터:**

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| BatchSize | 한 번에 가져올 메시지 수 | 10 (SQS 최대 10,000) |
| MaximumBatchingWindowInSeconds | 배치가 다 차지 않아도 강제 전송 대기 시간 | 0초 |
| FunctionResponseTypes | `ReportBatchItemFailures` 활성화 여부 | 비활성 |
| FilterCriteria | 특정 속성/값 메시지만 처리 | 없음 |

> 🔍 **더 깊이**: SQS ESM의 폴링은 Lambda 서비스가 SQS API `ReceiveMessage`를 주기적으로 호출하는 방식이다. 트래픽이 없을 때는 폴러 수가 줄어들고(최소 1개), 메시지가 쌓이면 폴러가 자동으로 늘어난다. 표준 큐에서는 최대 1,000개의 폴러가 동시에 동작할 수 있어 높은 처리량을 낼 수 있다. FIFO 큐에서는 메시지 그룹 ID당 하나의 Lambda 인스턴스가 처리해 순서를 보장한다.

## Partial Batch Response: 성공한 메시지는 보존하기

SQS ESM에서 배치 중 일부 메시지만 실패하면 기본 동작은 배치 전체가 실패로 간주된다. 성공한 9개 메시지가 1개 실패 때문에 전부 다시 처리되는 것이다.

`ReportBatchItemFailures`를 활성화하면 Lambda가 실패한 메시지 ID만 반환해 그것만 재처리한다.

```python
def lambda_handler(event, context):
    batch_item_failures = []
    
    for record in event['Records']:
        try:
            process_message(record)
        except Exception as e:
            # 이 메시지 ID만 실패로 보고
            batch_item_failures.append({
                'itemIdentifier': record['messageId']
            })
            print(f"실패: {record['messageId']}, 에러: {e}")
    
    # 실패 목록 반환 — Lambda가 이것만 큐에 되돌림
    return {'batchItemFailures': batch_item_failures}
```

```bash
# SQS ESM 생성 (Partial Batch Response 활성화)
aws lambda create-event-source-mapping \
  --function-name order-processor \
  --event-source-arn arn:aws:sqs:ap-northeast-2:123:orders-queue \
  --batch-size 100 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures
```

> ⚠️ **함정**: Partial Batch Response를 활성화해도 함수가 예외를 던지면(return이 아닌 raise) **전체 배치가 실패**로 처리된다. 반드시 try/except로 감싸고 `batchItemFailures`를 반환해야 한다. 또한 SQS FIFO 큐에서는 실패한 메시지 뒤의 메시지들이 모두 블록된다는 점에 주의해야 한다.

## Kinesis Data Streams ESM: 샤드 블록 문제

Kinesis와 Lambda의 통합에서 가장 위험한 함정은 **샤드 블록**이다.

Kinesis는 샤드(shard) 단위로 데이터를 처리한다. 각 샤드에서 레코드 순서가 보장된다. Lambda ESM은 샤드당 하나의 Lambda 인스턴스를 할당해 순서대로 처리한다.

**문제**: 하나의 레코드가 처리에 실패하면 Lambda는 그 레코드를 재시도한다. 재시도가 계속 실패하면 새 레코드를 처리할 수 없다 — **샤드 전체가 막힌다.** CloudWatch `IteratorAge` 메트릭이 계속 증가하는 것으로 감지할 수 있다.

**해결책:**

```bash
# Kinesis ESM 생성 (샤드 블록 방지 설정)
aws lambda create-event-source-mapping \
  --function-name kinesis-processor \
  --event-source-arn arn:aws:kinesis:ap-northeast-2:123:stream/events \
  --starting-position LATEST \
  --batch-size 100 \
  --maximum-retry-attempts 3 \
  --maximum-record-age-in-seconds 300 \
  --bisect-batch-on-function-error \
  --destination-config '{"OnFailure": {"Destination": "arn:aws:sqs:ap-northeast-2:123:failed-records"}}'
```

- `MaximumRetryAttempts`: 무한 재시도 대신 최대 횟수 설정 (0이면 재시도 없음)
- `MaximumRecordAgeInSeconds`: 이 시간이 지난 레코드는 폐기
- `BisectBatchOnFunctionError`: 실패 배치를 절반으로 나눠 이진 탐색으로 문제 레코드 격리
- `OnFailure Destination`: 최종 실패 레코드를 SQS나 SNS로 전송

**ParallelizationFactor**는 처리량을 높이는 고급 기능이다. 같은 샤드에서 최대 10개의 Lambda를 동시에 실행할 수 있다. 순서는 파티션 키 단위로 유지된다.

```bash
aws lambda create-event-source-mapping \
  --function-name kinesis-processor \
  --event-source-arn arn:aws:kinesis:ap-northeast-2:123:stream/events \
  --starting-position LATEST \
  --parallelization-factor 5
```

> 💡 **관련 이론**: Kinesis ESM의 파티션 키 단위 순서 보장은 분산 스트림 처리의 **partition-based ordering** 원칙과 같다. Kafka의 파티션 오프셋, Redis Streams의 그룹 소비자와 유사하다. 순서 보장과 병렬 처리는 트레이드오프 관계다 — 완전한 순서 보장을 원하면 샤드당 1개 Lambda로 직렬 처리해야 하고, 높은 처리량을 원하면 순서를 키 단위로만 보장하며 병렬화한다.

## DynamoDB Streams ESM: 변경 이벤트 처리

DynamoDB Streams는 테이블의 INSERT, MODIFY, REMOVE 이벤트를 24시간 동안 보존하는 스트림이다. Lambda ESM이 이 스트림을 폴링해 변경 이벤트를 처리한다.

DynamoDB Streams ESM은 Kinesis와 유사하게 동작하지만 차이점이 있다.

| 항목 | Kinesis Data Streams | DynamoDB Streams |
|------|---------------------|------------------|
| 보존 기간 | 24시간 ~ 365일 | 24시간 고정 |
| 시작 위치 | LATEST, TRIM_HORIZON, AT_TIMESTAMP | LATEST, TRIM_HORIZON |
| 샤드 관리 | 수동(명시적 샤드 수 설정) | 자동(DynamoDB가 관리) |
| 스트림 레코드 내용 | 원본 데이터 | 변경 전/후 이미지 선택 가능 |
| 스케일링 | 수동 리샤딩 | DynamoDB 오토스케일링과 연동 |

스트림 뷰 타입에 따라 함수가 받는 데이터가 달라진다.

| StreamViewType | 포함 데이터 |
|----------------|------------|
| `KEYS_ONLY` | 변경된 항목의 키만 |
| `NEW_IMAGE` | 변경 후 전체 항목 |
| `OLD_IMAGE` | 변경 전 전체 항목 |
| `NEW_AND_OLD_IMAGES` | 변경 전·후 모두 |

```python
def lambda_handler(event, context):
    for record in event['Records']:
        event_type = record['eventName']  # INSERT, MODIFY, REMOVE
        
        if event_type == 'INSERT':
            new_item = record['dynamodb']['NewImage']
            print(f"새 항목: {new_item}")
        
        elif event_type == 'MODIFY':
            old_item = record['dynamodb']['OldImage']
            new_item = record['dynamodb']['NewImage']
            # 변경된 필드 감지
            changed_fields = {
                k for k in new_item 
                if old_item.get(k) != new_item.get(k)
            }
            print(f"변경된 필드: {changed_fields}")
        
        elif event_type == 'REMOVE':
            old_item = record['dynamodb']['OldImage']
            print(f"삭제된 항목: {old_item}")
```

> 📚 **사례**: Airbnb는 DynamoDB Streams + Lambda 패턴으로 **이벤트 소싱(Event Sourcing)**을 구현했다. 예약 테이블의 모든 변경사항이 Streams에 기록되고, Lambda가 이를 Elasticsearch로 동기화해 검색 인덱스를 최신 상태로 유지했다. 이 패턴은 CQRS(Command Query Responsibility Segregation) 아키텍처의 핵심이기도 하다 — DynamoDB가 Command(쓰기)를, Elasticsearch가 Query(읽기)를 담당한다.

## EventBridge 스케줄 + Lambda

EventBridge(구 CloudWatch Events)는 두 가지 방식으로 Lambda를 트리거한다.

**Rate 표현식**: `rate(5 minutes)`, `rate(1 hour)` — 일정 간격으로 실행.

**Cron 표현식**: AWS의 cron은 표준 Linux cron과 다르다. 6개 필드를 사용하며 초 대신 연도를 포함한다. `cron(분 시간 일 월 요일 연도)`.

```bash
# 매일 오전 9시(UTC) 실행
aws events put-rule \
  --name daily-report \
  --schedule-expression "cron(0 9 * * ? *)"

# 5분마다 실행
aws events put-rule \
  --name health-check \
  --schedule-expression "rate(5 minutes)"
```

> ⚠️ **함정**: AWS EventBridge cron에서 **일(day-of-month)과 요일(day-of-week)은 동시에 지정할 수 없다.** 하나를 지정하면 다른 하나는 반드시 `?`(무관)로 설정해야 한다. `cron(0 9 15 * ? *)` (매월 15일), `cron(0 9 ? * MON-FRI *)` (평일)처럼 사용한다.

## 멱등성: at-least-once를 safely-exactly-once로

비동기 호출과 ESM 폴링은 모두 at-least-once 전달을 보장한다. 동일 이벤트가 두 번 처리될 수 있다. 함수를 멱등적으로 만들어야 중복 처리를 방어할 수 있다.

**Lambda Powertools Idempotency** 모듈은 DynamoDB를 이용해 이벤트 ID를 관리한다.

```python
from aws_lambda_powertools.utilities.idempotency import (
    idempotent, DynamoDBPersistenceLayer
)

persistence_layer = DynamoDBPersistenceLayer(
    table_name="IdempotencyTable"
)

@idempotent(persistence_store=persistence_layer)
def lambda_handler(event, context):
    # 이 코드는 같은 이벤트 ID로 다시 불려도 한 번만 실행됨
    charge_customer(event['customerId'], event['amount'])
    return {'charged': True}
```

내부 동작: 첫 호출 시 이벤트 ID(기본은 이벤트 전체의 해시)를 DynamoDB에 "IN_PROGRESS" 상태로 저장. 성공하면 "COMPLETED"와 결과를 저장. 동일 이벤트 ID로 다시 오면 DynamoDB에서 이전 결과를 꺼내 그대로 반환 — Lambda 코드는 실행되지 않는다.

> 🔍 **더 깊이**: 멱등성은 분산 시스템 이론에서 오래된 개념이다. Lamport의 1978년 논문 "Time, Clocks, and the Ordering of Events in a Distributed System"에서 메시지 전달 의미론을 다룬 이후, **at-most-once, at-least-once, exactly-once**라는 세 가지 전달 보장이 정의됐다. Exactly-once는 분산 시스템에서 달성하기 어렵다 — 분산 트랜잭션이 필요하거나(2PC, Saga), 멱등성 + at-least-once로 사실상 같은 효과를 낸다. Kafka의 정확히-한-번 전달도 idempotent producer + transactional producer 조합으로 구현된다.

## 호출 유형 종합 비교

| 특성 | 동기(API GW, ALB) | 비동기(S3, SNS) | ESM(SQS, Kinesis) |
|------|-------------------|-----------------|-------------------|
| 호출 흐름 | 호출자가 직접 invoke | Lambda 내부 큐 경유 | Lambda 서비스가 폴링 |
| 응답 | 즉시 반환 | ACK만 (202) | 없음 |
| 재시도 | 호출자 책임 | 자동 0~2회 | 설정 가능 |
| 에러 처리 | 호출자 직접 처리 | DLQ / Destinations | SQS DLQ, On Failure |
| 순서 보장 | 없음 | 없음 | 샤드/파티션 단위 |
| 최대 전달 크기 | 6MB (동기) | 256KB (비동기) | 배치 크기 제한 |
| DLQ 적용 | ❌ | ✅ Lambda DLQ | SQS 자체 DLQ |

## 마무리

Lambda의 세 가지 호출 방식 — 동기, 비동기, ESM — 은 각각 다른 신뢰성 모델을 가진다. 동기는 단순하지만 호출자가 모든 에러 처리를 책임진다. 비동기는 내구성이 높지만 멱등성 구현이 필수다. ESM은 관리된 폴링으로 편리하지만 Kinesis의 샤드 블록, SQS의 가시성 타임아웃 같은 메커니즘을 이해해야 한다. 이 차이를 명확히 구분하면 "SQS 메시지가 왜 반복 처리되지?", "Kinesis 레코드가 왜 쌓이지?" 같은 운영 질문에 즉시 답할 수 있다.

다음 글에서는 Lambda 배포 라이프사이클 — 환경 변수 관리, 레이어, 버전과 별칭, CodeDeploy 트래픽 시프트 — 를 다룬다.

---

## 📝 연습 문제

**문제 1.** Lambda ESM(Event Source Mapping)에서 SQS와의 통합을 올바르게 설명한 것은?

A) SQS가 새 메시지를 Lambda에 직접 푸시한다  
B) Lambda 서비스가 SQS를 롱 폴링하여 메시지를 배치로 가져온다  
C) S3처럼 비동기 호출 방식으로 동작한다  
D) SQS FIFO 큐는 Lambda와 통합할 수 없다  

**정답: B**  
해설: SQS ESM에서 Lambda 서비스가 능동적으로 SQS를 폴링(최대 20초 롱 폴링)해 메시지를 가져온다. SQS가 Lambda를 직접 호출하는 게 아니다. A는 틀렸다 — SQS는 push 방식이 아니다. C는 틀렸다 — ESM은 비동기 호출과 다른 범주다. D는 틀렸다 — FIFO 큐도 지원하며, 메시지 그룹 ID 단위로 순서를 보장한다.

---

**문제 2.** Kinesis Data Streams ESM에서 하나의 레코드가 계속 처리에 실패할 때 발생하는 현상과 해결책은?

A) 해당 레코드만 자동으로 DLQ로 이동한다  
B) Lambda가 해당 레코드를 자동 건너뛰고 다음 레코드를 처리한다  
C) 샤드 전체가 블록되어 새 레코드 처리가 중단된다 — MaximumRetryAttempts와 BisectBatchOnFunctionError로 해결한다  
D) Kinesis가 해당 샤드를 자동으로 분할한다  

**정답: C**  
해설: Kinesis ESM은 기본적으로 순서를 보장하기 위해 실패한 레코드를 계속 재시도하며, 이로 인해 샤드 전체가 막힐 수 있다. 해결책은 `MaximumRetryAttempts`로 재시도 횟수를 제한하고, `MaximumRecordAgeInSeconds`로 오래된 레코드를 폐기하며, `BisectBatchOnFunctionError`로 문제 레코드를 이진 탐색으로 격리하는 것이다. CloudWatch의 `IteratorAge` 메트릭이 계속 증가하면 이 상황을 감지할 수 있다.

---

**문제 3.** S3에 파일이 업로드될 때 Lambda가 처리 후 같은 버킷에 결과를 저장하면 무한 루프가 발생한다. 가장 적절한 해결책은?

A) Lambda 함수의 타임아웃을 1초로 설정한다  
B) 처리 결과를 다른 S3 버킷에 저장하거나 prefix/suffix 필터를 사용한다  
C) S3 이벤트 알림 대신 EventBridge만 사용한다  
D) Lambda 예약 동시성을 1로 설정한다  

**정답: B**  
해설: 가장 확실한 해결책은 입력 버킷과 출력 버킷을 분리하는 것이다. 분리가 어렵다면 S3 이벤트 알림에서 prefix/suffix 필터를 설정해 특정 경로(예: `input/`)의 파일만 트리거하고 결과는 다른 경로(`output/`)에 저장한다. A는 근본 해결이 아니다. C는 EventBridge를 써도 같은 버킷 쓰기 이벤트가 발생하면 동일한 문제가 생긴다. D는 동시성이 1이어도 루프는 계속 발생한다.

---

**문제 4.** Lambda 비동기 호출에서 Destinations(대상)이 DLQ보다 권장되는 이유는?

A) Destinations가 더 빠르고 비용이 낮다  
B) Destinations는 성공/실패 모두 처리하며 SQS·SNS·EventBridge·Lambda를 대상으로 지원하고, 풍부한 메타데이터를 포함한다  
C) DLQ는 SQS만 지원하고 Destinations는 모든 서비스를 지원한다  
D) Destinations는 재시도 횟수를 늘릴 수 있다  

**정답: B**  
해설: Destinations는 비동기 호출의 성공(OnSuccess)과 실패(OnFailure) 모두에 대응하며, 대상으로 SQS, SNS, EventBridge, Lambda를 지원한다. 또한 이벤트 페이로드만 전달하는 DLQ와 달리, 요청 컨텍스트, 응답, 에러 정보를 포함한 풍부한 메타데이터를 함께 전달해 디버깅이 쉽다. C는 틀렸다 — DLQ도 SNS를 지원한다.

---

**문제 5.** SQS ESM에서 배치 중 일부 메시지만 실패했을 때 성공한 메시지의 중복 처리를 방지하는 방법은?

A) 함수에서 예외를 던지지 않는다  
B) BatchSize를 1로 설정한다  
C) `ReportBatchItemFailures`를 활성화하고 `batchItemFailures` 응답을 반환한다  
D) DLQ를 설정하면 자동으로 처리된다  

**정답: C**  
해설: `FunctionResponseTypes`에 `ReportBatchItemFailures`를 설정하고, 함수가 실패한 메시지 ID를 `batchItemFailures` 목록으로 반환하면 Lambda가 그 메시지들만 재처리한다. 성공한 메시지들은 SQS에서 삭제된다. B는 동작하지만 처리량이 크게 줄어 비효율적이다. D는 틀렸다 — DLQ는 최종 실패 이벤트를 받는 곳이지, 배치 내 부분 실패를 처리하지 않는다.

---

**문제 6.** DynamoDB Streams에서 변경 전후 데이터를 모두 Lambda로 받으려면 어떤 StreamViewType을 사용해야 하는가?

A) KEYS_ONLY  
B) NEW_IMAGE  
C) OLD_IMAGE  
D) NEW_AND_OLD_IMAGES  

**정답: D**  
해설: `NEW_AND_OLD_IMAGES`는 변경된 항목의 이전 상태(OldImage)와 이후 상태(NewImage)를 모두 포함한다. 이는 감사 로그, 변경 감지, 데이터 동기화 시나리오에서 가장 많이 쓰인다. `KEYS_ONLY`는 기본 키만, `NEW_IMAGE`는 변경 후만, `OLD_IMAGE`는 변경 전만 전달한다. 비용은 뷰 타입에 따라 스트림 데이터 크기가 달라진다.

