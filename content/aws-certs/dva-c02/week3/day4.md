# Day 14 - Lambda 동시성 제어: Token Bucket 알고리즘과 에러 처리 계층

Lambda의 동시성 모델은 처음 보면 단순해 보인다. "함수가 동시에 몇 개 실행되느냐"의 문제처럼 보인다. 하지만 실제로는 계정 전체 한도, 함수별 Reserved 동시성, Provisioned 동시성, 버스트 한도라는 네 개의 다른 메커니즘이 중첩되어 있고, 이 계층 구조를 이해하지 못하면 "내 Lambda가 왜 429를 뱉는지", "왜 다른 팀 함수 때문에 내 함수가 느려지는지"를 설명할 수 없다.

에러 처리도 마찬가지다. 동기, 비동기, ESM 세 가지 호출 방식은 에러가 발생했을 때 완전히 다르게 반응한다. 이걸 모르면 Kinesis 샤드가 통째로 막히거나, SQS 메시지가 영원히 재처리되는 사고로 이어진다.

## 동시성의 정의와 계산

Lambda 동시성은 **특정 시점에 동시에 실행 중인 함수 인스턴스 수**다. 공식은 간단하다.

```
동시성 = 초당 요청 수(RPS) × 평균 실행 시간(초)

예:
- RPS = 1,000, 평균 실행 시간 = 200ms(0.2초)
- 동시성 = 1,000 × 0.2 = 200

- RPS = 100, 평균 실행 시간 = 5초
- 동시성 = 100 × 5 = 500
```

이 공식에서 보이는 것처럼, 실행 시간이 길수록 동시성 소비가 크다. 타임아웃을 15분으로 설정한 Lambda가 100개 동시 실행되고 있다면, 그 15분 동안 1,500 동시성을 차지한다 — 계정 기본 한도(1,000)를 이미 초과한다.

> 💡 **관련 이론**: Lambda의 동시성 소비 계산은 Little's Law(리틀의 법칙, 1961)와 동일하다. `L = λW` — L이 시스템 내 평균 항목 수(동시성), λ가 도착률(RPS), W가 시스템에서 보내는 평균 시간(실행 시간)이다. 이 법칙은 큐 이론(Queueing Theory)의 기반이며, 콜 센터 인력 계산에서 클라우드 용량 계획까지 광범위하게 사용된다. M/M/c 큐 모델로 확장하면 Lambda 스로틀링 확률도 계산할 수 있다.

## 동시성 네 계층의 완전한 그림

```
계정/리전 전체 한도: 1,000 (기본, 증가 요청 가능)
│
├── [함수 A] Reserved: 300 → 최대 300개 인스턴스
│   └── Provisioned: 20 → 항상 20개 미리 초기화
│
├── [함수 B] Reserved: 200 → 최대 200개 인스턴스
│
└── [나머지 함수들] 공유 풀: 500 (1000 - 300 - 200)
    └── Reserved 없는 모든 함수가 이 500을 두고 경쟁
```

**Reserved Concurrency(예약 동시성):**
- 함수의 동시성 **상한선**이자 **전용 할당**
- 이 함수는 최대 N개까지만 실행되고, 다른 함수가 이 N개를 쓸 수 없다
- 0으로 설정하면 완전 차단(ThrottlingException)
- 비용: 없음

**Provisioned Concurrency(프로비저닝된 동시성):**
- 지정한 수만큼 MicroVM을 미리 초기화해 대기
- 콜드 스타트 없이 즉시 INVOKE 단계만 실행
- 반드시 버전 또는 별칭에만 설정 가능 (`$LATEST` 불가)
- 비용: 초기화된 인스턴스 수 × 시간 × 메모리(GB) × $0.0000097222/GB-초

```bash
# Reserved Concurrency 설정
aws lambda put-function-concurrency \
  --function-name payment-api \
  --reserved-concurrent-executions 300

# 완전 차단 (모든 요청 즉시 ThrottlingException)
aws lambda put-function-concurrency \
  --function-name maintenance-mode-function \
  --reserved-concurrent-executions 0

# Provisioned Concurrency (별칭에)
aws lambda put-provisioned-concurrency-config \
  --function-name payment-api \
  --qualifier prod \
  --provisioned-concurrent-executions 20
```

> ⚠️ **함정**: Reserved Concurrency를 설정하면 계정 전체 풀에서 그만큼이 차감된다. 함수 A에 Reserved=500을 설정하면 나머지 함수들은 500만 공유한다. 함수들이 많이 동시에 실행되는 피크타임에 "왜 갑자기 다른 함수들이 스로틀링 되지?"라는 상황이 Reserved 설정 때문에 발생하는 경우가 있다.

## 버스트 동시성 한도: 스케일아웃의 속도 제한

Lambda는 트래픽 급증 시 자동으로 동시성을 늘린다. 하지만 무한정 빠르게 늘릴 수는 없다.

**초기 버스트 한도:** 리전별로 500~3,000개. 서울(ap-northeast-2)은 500개.

**이후 증가율:** 분당 +500개씩 추가.

이 의미는: 갑자기 5,000 동시성이 필요한 트래픽이 들어오면, 첫 번째 분에는 500개만, 2분 후에 1,000개, 3분 후에 1,500개... 순서로 늘어난다. 계정 한도(1,000)에 도달할 때까지. 한도 증가 요청으로 계정 한도를 5,000으로 올려놓았어도, 스케일아웃 속도는 마찬가지로 분당 +500개다.

이 속도를 초과하는 요청은 **ThrottlingException(429)**을 받는다.

| 리전 | 초기 버스트 |
|------|------------|
| us-east-1, us-west-2, eu-west-1 | 3,000 |
| ap-northeast-1 (도쿄), ap-southeast-1 | 1,000 |
| ap-northeast-2 (서울) | 500 |
| 나머지 리전 | 500 |

> 🔍 **더 깊이**: 버스트 한도는 Token Bucket 알고리즘으로 구현된다. 버킷에는 최대 3,000개(리전 버스트 한도)의 토큰이 있고, 분당 500개씩 채워진다. Lambda 호출 시 토큰을 하나 소비한다. 토큰이 없으면 429. 이 알고리즘은 AWS API Gateway, SQS, Kinesis, EC2 API 등 AWS 전반에서 스로틀링 제어에 사용된다. RFC 6585에서 HTTP 429 상태 코드를 정의했다.

## CloudWatch 메트릭으로 동시성 문제 진단

| 메트릭 | 네임스페이스 | 의미 | 높으면 조치 |
|--------|------------|------|------------|
| `ConcurrentExecutions` | AWS/Lambda | 현재 동시 실행 수 | Reserved 한도에 근접하면 증가 고려 |
| `Throttles` | AWS/Lambda | 스로틀된 호출 수 | Reserved/계정 한도 증가 |
| `ProvisionedConcurrencyUtilization` | AWS/Lambda | PC 사용률 | 80% 이상 지속 시 PC 추가 |
| `IteratorAge` | AWS/Lambda | Kinesis/DDB Streams 처리 지연 | 계속 증가 → ParallelizationFactor 늘리기 |
| `DeadLetterErrors` | AWS/Lambda | DLQ 전송 실패 | DLQ 권한(IAM) 확인 |

```bash
# CloudWatch에서 동시성 메트릭 조회
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=payment-api \
  --start-time 2026-05-31T00:00:00Z \
  --end-time 2026-05-31T23:59:59Z \
  --period 300 \
  --statistics Maximum
```

> 💡 **관련 이론**: `IteratorAge`는 현재 시간과 Kinesis/DynamoDB Streams에서 처리 중인 레코드의 Put 시간 차이다. 이 값이 계속 증가하면 Lambda가 스트림 속도를 따라잡지 못하는 것이다. 해결책은 Kinesis 샤드 수 증가(처리량 분산), Lambda `ParallelizationFactor` 증가(샤드당 병렬 Lambda 수), 또는 Lambda 실행 시간 최적화다.

## 에러 처리 계층: 호출 방식별 완전 비교

에러가 발생했을 때 "누가 재시도하는가", "어디로 실패 이벤트가 가는가"가 호출 방식마다 완전히 다르다.

**동기 호출 (API Gateway, ALB, 직접 invoke):**
- Lambda가 에러를 던지면 HTTP 200 + `FunctionError` 헤더로 응답
- 재시도는 **호출자의 책임** (API Gateway 기본: 재시도 없음)
- DLQ 없음. 에러 이벤트가 어디로도 가지 않는다
- 클라이언트가 503이나 500을 받으면 직접 재시도 구현 필요

**비동기 호출 (S3, SNS, EventBridge, 직접 invoke Event 타입):**
- Lambda 서비스가 내부 큐에 이벤트를 보관
- 자동 재시도: 최대 2회, 1분/2분 간격(지수 백오프)
- 최종 실패 시 DLQ(SQS 또는 SNS) 또는 Destinations OnFailure로 전송
- 이벤트 나이 최대 21,600초(6시간) — 그 이후엔 처리 안 됨

**ESM 폴링 (SQS, Kinesis, DDB Streams):**
- SQS: 가시성 타임아웃 후 메시지가 큐로 복귀. `maxReceiveCount` 초과 시 SQS DLQ
- Kinesis/DDB Streams: 기본 무한 재시도(샤드 블록!). `MaximumRetryAttempts`로 제한 필수
- Lambda 함수의 DLQ와 SQS 큐의 DLQ는 **완전히 다른 개념**

```
호출 방식별 에러 처리 흐름

[동기 - API Gateway]
클라이언트 → API GW → Lambda → 에러 발생
                              ↓
              API GW에 FunctionError 응답
                              ↓
              클라이언트에 5XX 반환 (API GW 설정에 따라)
              재시도 = 클라이언트 코드가 결정

[비동기 - S3]
S3 업로드 → Lambda 내부 큐 → Lambda 실행 → 에러 발생
                               ↓
                         1분 후 자동 재시도
                               ↓ (또 실패)
                         2분 후 자동 재시도
                               ↓ (또 실패)
                     → DLQ 또는 Destinations OnFailure

[ESM - SQS]
메시지 → Lambda 폴링 → Lambda 실행 → 에러 발생
                               ↓
         가시성 타임아웃 종료 후 메시지 큐 복귀
                               ↓ (maxReceiveCount 초과)
                     → SQS DLQ (함수 DLQ 아님!)
```

> 📚 **사례**: 2020년 한 핀테크 스타트업이 Kinesis + Lambda로 실시간 거래 이상 감지 시스템을 구축했다. 특정 포맷의 이상 거래 레코드가 Lambda 처리를 실패시켰는데, `MaximumRetryAttempts`를 설정하지 않아 샤드 전체가 블록됐다. 수시간 동안 새 거래 데이터가 처리되지 않았고, 이상 거래 알림이 전혀 가지 않았다. `CloudWatch IteratorAge` 메트릭이 치솟고 있었지만 알람이 없어서 늦게 발견됐다. 이후 회사는 `IteratorAge > 300000ms`(5분) 알람을 모든 Kinesis ESM에 필수 설정으로 정책화했다.

## DLQ vs Lambda Destinations: 정확한 선택 기준

| 상황 | 권장 |
|------|------|
| 비동기 호출 실패 이벤트 보존 | Destinations OnFailure |
| 비동기 호출 성공 이벤트도 감사 필요 | Destinations OnSuccess |
| SQS-Lambda ESM에서 최종 실패 처리 | SQS 큐 자체에 DLQ 설정 |
| 기존 레거시 코드가 DLQ를 이미 사용 중 | DLQ 유지 (마이그레이션 여유 있을 때 Destinations로) |

Destinations가 DLQ보다 나은 이유:
1. **성공 이벤트 처리 가능**: 함수가 성공했을 때도 이벤트를 보낼 수 있다 (감사, 다음 단계 트리거)
2. **더 다양한 대상**: SQS, SNS뿐 아니라 EventBridge와 Lambda도 대상
3. **풍부한 컨텍스트**: 원본 이벤트 + 요청 컨텍스트 + 응답/에러 정보를 모두 포함한 JSON
4. **표준 비동기 패턴**: 이벤트 기반 아키텍처의 팬아웃과 더 잘 맞음

```python
# Destinations OnFailure가 전달하는 이벤트 구조 (예시)
{
  "version": "1.0",
  "timestamp": "2026-05-31T09:30:00Z",
  "requestContext": {
    "requestId": "abc-123",
    "functionArn": "arn:aws:lambda:...:function:payment-api:prod",
    "condition": "RetriesExhausted",
    "approximateInvokeCount": 3  # 원본 1회 + 재시도 2회
  },
  "requestPayload": {
    "customerId": "C001",
    "amount": 9999
  },
  "responseContext": {
    "statusCode": 200,  # Lambda API 수준, 함수 에러가 있어도 200
    "executedVersion": "$LATEST",
    "functionError": "Unhandled"
  },
  "responsePayload": {
    "errorMessage": "Payment gateway timeout",
    "errorType": "TimeoutError"
  }
}
```

## SQS DLQ vs Lambda DLQ: 같은 이름 다른 개념

시험에서 가장 많이 혼동하는 부분이다.

**SQS DLQ(Dead Letter Queue):**
- SQS 큐의 **속성**이다
- SQS 메시지가 `maxReceiveCount` 횟수를 초과해 소비됐을 때 SQS DLQ로 이동
- SQS-Lambda ESM에서 Lambda가 반복 실패하면 → 메시지가 가시성 타임아웃마다 재시도 → `maxReceiveCount` 초과 → SQS DLQ

**Lambda DLQ:**
- Lambda 함수의 **설정**이다
- **비동기 호출**이 최종 실패(원본 + 2회 재시도 모두 실패)할 때 이벤트를 전송
- SQS-Lambda ESM에서는 Lambda DLQ가 적용되지 않는다. ESM 실패는 SQS DLQ가 담당

```
시나리오: SQS → Lambda ESM에서 Lambda가 계속 실패

Lambda DLQ 설정 여부와 무관!
  → 메시지가 가시성 타임아웃 후 SQS 큐로 복귀
  → maxReceiveCount(기본 3) 초과 후
  → SQS 큐에 설정된 DLQ로 이동

Lambda DLQ는 S3/SNS 등 비동기 호출에서 동작
```

## Reserved + Provisioned 동시성을 함께 쓰는 실전 패턴

```
시나리오: 금융 API (결제 처리)
- 평소 트래픽: 50 동시성
- 피크 트래픽: 200 동시성
- 콜드 스타트 허용 불가 (응답 시간 SLA: p99 < 500ms)

설정:
Reserved Concurrency = 300  (계정 한도에서 300 전용 할당)
Provisioned Concurrency = 50  (항상 50개 웜 상태 대기)

동작:
- 평소: 50개 Provisioned 인스턴스가 처리, 콜드 스타트 없음
- 트래픽 급증 시: 50개를 초과하는 요청은 새 인스턴스 생성(콜드 스타트 발생 가능)
- 트래픽이 300 초과 시: ThrottlingException (Reserved가 상한선 역할)
- 다른 함수들이 이 300을 쓸 수 없음 (전용 할당)

Auto Scaling 설정:
PC를 80% 사용 시 자동으로 PC 추가
```

```bash
# Application Auto Scaling으로 Provisioned Concurrency 자동 조절
aws application-autoscaling register-scalable-target \
  --service-namespace lambda \
  --resource-id function:payment-api:prod \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --min-capacity 10 \
  --max-capacity 200

aws application-autoscaling put-scaling-policy \
  --service-namespace lambda \
  --resource-id function:payment-api:prod \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --policy-name pc-tracking-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 0.7,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "LambdaProvisionedConcurrencyUtilization"
    }
  }'
```

## 비동기 에러 처리 패턴: 비즈니스 에러 vs 시스템 에러

Lambda에서 에러를 모두 같은 방식으로 처리하면 안 된다.

**시스템 에러(재시도 가능)**: DB 연결 실패, HTTP 타임아웃, 일시적 503. 예외를 던져서 Lambda 재시도 메커니즘을 활용한다.

**비즈니스 에러(재시도 불필요)**: 유효하지 않은 데이터, 권한 없음, 도메인 규칙 위반. 재시도해도 결과가 같으므로 예외를 던지지 말고 성공 응답을 반환하거나 에러 이벤트를 다른 큐로 라우팅한다.

```python
import logging
import json
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

class BusinessError(Exception):
    """도메인 규칙 위반 — 재시도해도 의미 없음"""
    pass

class RetryableError(Exception):
    """일시적 시스템 오류 — 재시도하면 성공할 수 있음"""
    pass

def lambda_handler(event, context):
    try:
        order_id = event.get('orderId')
        if not order_id:
            # 비즈니스 에러 — 재시도해도 소용 없음
            # 예외 대신 에러 응답을 반환하거나 SQS에 직접 보내기
            logger.error(f"유효하지 않은 주문 ID: {event}")
            return {'status': 'BUSINESS_ERROR', 'reason': 'orderId missing'}
        
        result = process_order(order_id)
        return {'status': 'SUCCESS', 'orderId': order_id}
    
    except RetryableError as e:
        # 재시도 필요 — 예외를 다시 던져서 Lambda 재시도 유도
        logger.warning(f"일시적 오류, 재시도 예정: {str(e)}")
        raise  # Lambda 비동기 재시도 메커니즘이 동작
    
    except Exception as e:
        # 예상치 못한 에러 — 재시도하면서 상황 파악
        logger.error(f"예상치 못한 에러: {str(e)}", exc_info=True)
        raise
```

> 🔍 **더 깊이**: 비즈니스 에러와 시스템 에러를 구분하는 패턴은 Martin Fowler의 "Patterns of Enterprise Application Architecture"(2002)에서 논의된다. 분산 시스템에서는 여기에 **일시적 장애(transient failure)** 개념이 추가된다 — 재시도하면 성공할 수 있는 오류. AWS SDK는 내부적으로 exponential backoff with jitter를 사용해 재시도한다. 이 알고리즘은 AWS "Exponential Backoff And Jitter" 블로그 포스트(2015)에서 공개적으로 설명됐다.

## 스로틀링 대응 패턴

**동기 호출에서 429를 받는 클라이언트:**
```python
import boto3
import time
from botocore.exceptions import ClientError

lambda_client = boto3.client('lambda')

def invoke_with_retry(function_name, payload, max_retries=3):
    for attempt in range(max_retries):
        try:
            return lambda_client.invoke(
                FunctionName=function_name,
                InvocationType='RequestResponse',
                Payload=payload
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'TooManyRequestsException':
                wait_time = (2 ** attempt) + (random.random() * 0.5)  # jitter
                logger.warning(f"스로틀링. {wait_time:.2f}초 후 재시도 (시도 {attempt+1}/{max_retries})")
                time.sleep(wait_time)
            else:
                raise
    raise Exception("최대 재시도 횟수 초과")
```

**SQS를 완충재로 사용:**
급격한 트래픽 급증이 예상된다면, 호출자가 직접 Lambda를 호출하는 대신 SQS에 넣고, Lambda ESM이 처리 속도를 조절하도록 한다. SQS가 완충재(buffer) 역할을 한다.

```
[트래픽 급증] → [직접 Lambda 호출] → 429 스로틀링
                                         ↓
[트래픽 급증] → [SQS 큐] → [Lambda ESM] → 처리 속도 자동 조절
```

> 💡 **관련 이론**: 이 패턴은 분산 시스템에서 **백프레셔(Backpressure)** 처리의 전형이다. Reactive Streams 사양(Java 9 Flow API, Project Reactor, RxJava)에서 다운스트림이 처리 가능한 속도로 업스트림을 제어하는 것과 같다. SQS가 업스트림의 속도를 흡수하고, Lambda가 처리할 수 있는 속도로 소비한다.

## 마무리

Lambda 동시성 제어는 네 개의 다른 메커니즘이 중첩된 시스템이다. Reserved는 함수별 격리와 상한선을 제공하고, Provisioned는 콜드 스타트를 제거하며, 버스트 한도는 스케일아웃 속도를 제한하고, 계정 한도는 전체 상한을 정한다. 에러 처리는 호출 방식마다 완전히 다른 계층에서 일어나며, "어디서 재시도하고 어디로 실패 이벤트가 가는지"를 호출 방식별로 정확히 알아야 한다.

다음 글에서는 이 Week 3 전체를 복습하면서 Lambda의 모든 개념을 시나리오 기반 문제로 점검한다.

---

## 📝 연습 문제

**문제 1.** Lambda 함수의 초당 요청이 2,000개이고 평균 실행 시간이 300ms일 때 필요한 동시성은?

A) 100  
B) 300  
C) 600  
D) 2,000  

**정답: C**  
해설: 동시성 = RPS × 실행 시간(초) = 2,000 × 0.3 = 600. 이 동시성을 안정적으로 확보하려면 계정 동시성 한도(기본 1,000)의 60%를 차지하는 셈이다. 이 함수에 Reserved Concurrency 700을 설정하면 충분한 여유를 확보하면서 다른 함수를 위한 300도 남길 수 있다.

---

**문제 2.** Lambda 함수의 Reserved Concurrency를 0으로 설정했을 때의 결과는?

A) 기본 동시성 한도(1,000)가 적용된다  
B) 함수가 순차적으로만 실행된다  
C) 모든 호출이 즉시 ThrottlingException(429)을 반환한다  
D) 함수가 Lambda 서비스에서 제거된다  

**정답: C**  
해설: Reserved Concurrency를 0으로 설정하면 함수에 할당된 동시성이 0개이므로 모든 호출이 즉시 스로틀된다. 이는 함수를 임시로 비활성화하는 방법으로 사용된다(코드 배포 없이, 삭제하지 않고). 배포 창 밖 시간에 실수로 함수가 호출되는 것을 막거나, 긴급 차단이 필요할 때 유용하다.

---

**문제 3.** Kinesis Data Streams ESM에서 하나의 레코드가 계속 실패할 때 발생하는 문제와 가장 효과적인 해결책 조합은?

A) Lambda DLQ가 자동으로 실패 레코드를 격리한다  
B) 샤드 전체가 블록된다 — MaximumRetryAttempts와 BisectBatchOnFunctionError + OnFailure Destination으로 해결한다  
C) Kinesis가 해당 레코드를 자동 삭제한다  
D) Lambda가 자동으로 해당 레코드를 건너뛴다  

**정답: B**  
해설: Kinesis ESM은 기본적으로 실패한 레코드를 무한 재시도하며, 이로 인해 해당 샤드의 모든 새 레코드 처리가 차단된다. CloudWatch `IteratorAge` 메트릭이 계속 증가하면 이 상황임을 알 수 있다. 해결책: `MaximumRetryAttempts`로 재시도 횟수 제한, `BisectBatchOnFunctionError`로 실패 배치를 이진 탐색해 문제 레코드 격리, `OnFailure Destination`으로 최종 실패 레코드를 SQS/SNS로 전송해 나중에 분석한다.

---

**문제 4.** SQS DLQ와 Lambda DLQ의 차이점으로 옳은 것은?

A) SQS DLQ는 비동기 Lambda 호출에, Lambda DLQ는 ESM에 적용된다  
B) SQS DLQ는 SQS 큐의 속성으로 ESM 실패 처리에 적용되고, Lambda DLQ는 비동기 호출 최종 실패 시 이벤트를 전송한다  
C) 두 개념은 동일하며 이름만 다르다  
D) Lambda DLQ만이 EventBridge를 대상으로 지원한다  

**정답: B**  
해설: SQS DLQ는 SQS 큐 자체의 속성으로, SQS 메시지가 `maxReceiveCount`를 초과하면 해당 메시지를 DLQ로 이동시킨다. SQS-Lambda ESM에서 Lambda가 반복 실패하면 메시지가 가시성 타임아웃 후 큐로 복귀하고, maxReceiveCount 초과 시 SQS DLQ로 이동한다. Lambda DLQ는 Lambda 함수 설정의 일부로, 비동기 호출(S3, SNS 등)이 최종 실패(원본+2회 재시도 모두 실패)할 때 이벤트를 SQS 또는 SNS로 보낸다.

---

**문제 5.** 다음 중 Lambda Destinations의 장점이 아닌 것은?

A) 성공 이벤트와 실패 이벤트 모두에 대해 대상을 설정할 수 있다  
B) EventBridge를 대상으로 지원한다  
C) SQS ESM의 실패한 메시지를 자동으로 처리한다  
D) 원본 이벤트와 함수 응답 메타데이터를 함께 전달한다  

**정답: C**  
해설: Lambda Destinations는 비동기 호출(S3, SNS, EventBridge, 직접 비동기 invoke)에만 적용된다. SQS ESM에서의 실패는 Lambda Destinations가 아닌 SQS 큐 자체의 DLQ 설정으로 처리된다. A, B, D는 모두 Destinations의 실제 장점이다.

---

**문제 6.** 서울 리전(ap-northeast-2)에서 Lambda 버스트 동시성 한도는?

A) 3,000  
B) 1,000  
C) 500  
D) 제한 없음  

**정답: C**  
해설: 서울 리전의 초기 버스트 동시성 한도는 500이다. us-east-1, us-west-2, eu-west-1은 3,000이다. 초기 버스트 이후에는 분당 +500개씩 증가할 수 있으며, 계정 한도(기본 1,000)까지 늘어날 수 있다. 이 한도를 초과하는 갑작스러운 트래픽 급증에서는 ThrottlingException이 발생한다.

