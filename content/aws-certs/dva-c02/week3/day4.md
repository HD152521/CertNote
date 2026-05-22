# Day 14 - Lambda: 동시성, 오류 처리, DLQ

📅 날짜: 2026년 6월 3일 (수요일)  
🎯 주제: Lambda 동시성 및 오류 처리  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lambda 동시성(Concurrency) 모델을 이해한다
- Lambda 오류 처리 방법과 재시도 정책을 설명한다
- DLQ(Dead Letter Queue)와 Lambda Destinations를 구성한다

---

## 📖 이론 내용

### 1. Lambda 동시성 (Concurrency)

동시성은 주어진 시간에 동시 처리 중인 Lambda 함수 실행 수입니다.

**동시성 계산:**
```
동시성 = 초당 요청 수 × 평균 실행 시간(초)
예: 1000 req/s × 0.5초 = 500 동시성
```

**동시성 유형:**

#### 예약 동시성 (Reserved Concurrency)
- 특정 함수에 동시성 상한선 설정
- 다른 함수가 이 동시성을 사용할 수 없음
- **⭐ 동시성을 0으로 설정하면 함수 실행 완전 차단**
- 스로틀링 방지 또는 다른 함수 보호에 사용

#### 프로비저닝된 동시성 (Provisioned Concurrency)
- 미리 초기화된 실행 환경 유지
- 콜드 스타트 완전 제거
- 비용 추가 발생 (초기화 시간에도 과금)
- **⭐ 일관된 응답 시간이 중요한 API에 사용**

#### 계정 동시성 한도
- 리전별 기본 1,000 동시성
- 증가 요청 가능

### 2. Lambda 스로틀링 (Throttling)

동시성 한도 초과 시 스로틀링 발생:
- **동기 호출**: HTTP 429 (Too Many Requests) 오류 반환
- **비동기 호출**: 자동 재시도, 그 후 DLQ 또는 Destinations

### 3. Lambda 오류 처리

#### 오류 유형
- **함수 오류**: 핸들러 코드에서 발생한 예외
- **런타임 오류**: 타임아웃, 메모리 부족 등
- **호출 오류**: 서비스 오류 (스로틀링 등)

#### 동기 호출 오류 처리
```python
import json
import boto3

lambda_client = boto3.client('lambda')

try:
    response = lambda_client.invoke(
        FunctionName='my-function',
        InvocationType='RequestResponse',  # 동기
        Payload=json.dumps({'key': 'value'})
    )
    
    # 함수 오류 확인 (HTTP 200이어도 함수 내부 오류 가능)
    if 'FunctionError' in response:
        error_payload = json.loads(response['Payload'].read())
        print(f"함수 오류: {error_payload}")
    else:
        result = json.loads(response['Payload'].read())
        print(f"성공: {result}")

except lambda_client.exceptions.TooManyRequestsException:
    print("스로틀링 발생 - 재시도 필요")
```

#### 비동기 호출 재시도
- 자동 2회 재시도
- 재시도 간격: 1분, 2분
- 실패 후 DLQ 또는 Destinations로 이벤트 전송

### 4. DLQ (Dead Letter Queue)

실패한 비동기 Lambda 이벤트를 수신하는 큐입니다.

**지원 대상:**
- Amazon SQS 큐
- Amazon SNS 주제

**DLQ 사용 시나리오:**
- 처리 실패한 이벤트 보존
- 실패 분석 및 재처리
- 경보 설정

### 5. Lambda Destinations (대상)

Destinations는 DLQ의 더 발전된 형태입니다.

**Destinations 지원:**
- 성공/실패 모두 설정 가능
- **SQS, SNS, EventBridge, Lambda** 대상 지원
- 이벤트 결과와 함께 메타데이터 포함

**DLQ vs Destinations:**
| 특성 | DLQ | Destinations |
|------|-----|--------------|
| 성공 시 | 설정 불가 | 설정 가능 |
| 지원 서비스 | SQS, SNS | SQS, SNS, EventBridge, Lambda |
| 이벤트 컨텍스트 | 기본 | 풍부한 메타데이터 |
| 권장 | 구형 | **최신, 권장** |

---

## 🧠 알아두면 좋은 심화 이론

### 동시성 4종 - 정확한 차이 (시험에서 헷갈리기 좋음)

| 종류 | 단위 | 비용 | 용도 |
|------|------|------|------|
| **계정 동시성 한도** | 리전 전체 | - | 기본 1,000 (증가 요청 가능) |
| **예약 동시성 (Reserved)** | 함수당 | 무료 | 함수별 상한선 보장 |
| **프로비저닝된 동시성 (Provisioned)** | 함수·버전·별칭당 | 시간당 과금 | 콜드 스타트 제거 |
| **버스트 동시성** | 리전 즉시 한도 | - | 초기 500~3,000 + 분당 +500 |

> ⚠️ **함정**:
> - **Reserved=0** → 함수 완전 비활성화
> - Reserved를 설정한 함수는 **전체 동시성 풀에서 그만큼 차감** (나머지 함수가 쓸 수 있는 양 ↓)
> - Provisioned는 **버전 또는 별칭**에만 설정 가능 ($LATEST 불가)

### 동시성 스케일링 한도 (시험에 자주 나옴)

```
초기 버스트:     ~3,000 (리전에 따라 500/1,000/3,000)
이후:           분당 +500 동시성씩 증가
계정 한도까지 도달 가능
```

스케일링 속도 한도를 넘으면 **429 스로틀링** → 동기 호출자가 직접 백오프해야 함.

### 동기 vs 비동기 vs ESM 에러 처리 정확히

| 트리거 | 에러 발생 시 |
|--------|---------------|
| **동기 (API GW)** | 500 응답 → API GW가 클라이언트에 5xx |
| **비동기 (S3, SNS)** | 자동 2회 재시도 → DLQ/Destinations |
| **SQS** | 가시성 타임아웃 후 메시지 큐로 복귀 (`maxReceiveCount` 도달 시 SQS DLQ로) |
| **Kinesis/DDB Streams** | 기본 무한 재시도 (전체 샤드 블록!) → MaximumRetryAttempts·MaximumRecordAgeInSeconds 설정 필수 |

> ⚠️ **함정**: Kinesis ESM에서 한 레코드가 계속 실패하면 **전체 샤드가 막힘** → 시험 시나리오. 대응: BisectBatchOnFunctionError + OnFailure destination.

### SQS DLQ vs Lambda DLQ - 다른 개념!

| 항목 | SQS DLQ | Lambda DLQ |
|------|---------|------------|
| 위치 | SQS 큐의 속성 | Lambda 함수 속성 |
| 동작 | `maxReceiveCount` 초과 메시지 자동 이동 | Lambda 비동기 호출 최종 실패 시 발송 |
| 적용 | SQS → Lambda 모두 | 비동기 호출만 |

> 시험에 SQS-Lambda 시나리오에서 "메시지 4번 실패하면 어디로?" → **SQS 큐의 DLQ** 설정.

### Lambda Function URL과 동시성

- Function URL도 일반 동기 호출과 같음
- 429 스로틀 발생 가능
- API Gateway 같은 자동 백오프는 없음 → 클라이언트가 처리

### CloudWatch Lambda 메트릭 (시험 출제 - Troubleshooting)

| 메트릭 | 의미 |
|--------|------|
| **Invocations** | 호출 횟수 |
| **Duration** | 실행 시간 |
| **Errors** | 함수 오류 수 |
| **Throttles** | 스로틀된 호출 수 |
| **ConcurrentExecutions** | 동시 실행 수 |
| **ProvisionedConcurrencyUtilization** | PC 사용률 (80% 넘으면 부족) |
| **IteratorAge** | Kinesis/DDB Streams 처리 지연 |
| **DeadLetterErrors** | DLQ 전송 실패 (DLQ 권한 부족) |

> 💡 **IteratorAge가 계속 증가** → Lambda가 스트림을 못 따라잡음 → 동시성 ↑, ParallelizationFactor ↑, 처리 로직 최적화.

### Reserved와 Provisioned 같이 쓰는 패턴

```
함수 A: Reserved Concurrency = 100
         Provisioned Concurrency = 30 (버전 5 별칭 "prod")
         
의미: 항상 30개 환경 미리 켜둠 (콜드 X)
      최대 100개까지 확장
      나머지 70개는 일반 환경에서 콜드 스타트 발생 가능
```

### 관련 서비스 Cross-Reference

- **CloudWatch 경보 → Auto-rollback** → [Week 8 Day 3 CodeDeploy]
- **X-Ray** → [Week 10 Day 3]: Lambda 함수 추적
- **EventBridge 스케줄** → [Week 11 Day 3]
- **SQS visibility timeout** → [Week 11 Day 1]

---

## 아키텍처 다이어그램

```
Lambda 동시성 관리
================================

계정 동시성 한도: 1000
  |
  +-- my-api-function: 예약 동시성 300
  |    (최대 300개 동시 실행, 이 함수 전용)
  |
  +-- my-batch-function: 예약 동시성 200
  |    (최대 200개 동시 실행)
  |
  +-- 나머지 함수들: 500개 공유
       (예약 동시성 없음)

프로비저닝된 동시성:
my-api-function: 10개 환경 미리 초기화
  --> 콜드 스타트 없이 즉시 10개까지 처리

Lambda 오류 처리 흐름
================================

[이벤트 발생]
     |
     v
[Lambda 호출 시도]
     |
     +-- 성공 --> 결과 반환 --> [성공 Destination]
     |
     실패
     |
     v
[재시도 1 (1분 후)]
     |
     +-- 성공 --> [성공 Destination]
     |
     실패
     |
     v
[재시도 2 (2분 후)]
     |
     +-- 성공 --> [성공 Destination]
     |
     최종 실패
     |
     v
[DLQ 또는 실패 Destination]
(SQS/SNS/EventBridge/Lambda)
     |
     v
[실패 이벤트 분석/재처리]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **예약 동시성 = 0**: 함수 완전 비활성화 (모든 요청 스로틀)
2. ⭐ **비동기 재시도**: 최대 2회, 1분/2분 간격
3. ⭐ **Destinations > DLQ**: 성공 이벤트도 처리, 더 많은 대상, 권장
4. ⭐ **스로틀링 대응**: 동기=429 오류, 비동기=큐에 남겨두고 재시도
5. ⭐ **동시성 공식**: 초당 요청 수 × 평균 실행 시간

---

## 💻 실제 예시

```python
# Lambda 함수 오류 처리 패턴
import json
import logging
import traceback

logger = logging.getLogger()
logger.setLevel(logging.INFO)

class BusinessError(Exception):
    """비즈니스 로직 오류 (재시도하면 안 되는 오류)"""
    pass

class TransientError(Exception):
    """일시적 오류 (재시도 가능)"""
    pass

def lambda_handler(event, context):
    try:
        # 비즈니스 로직
        result = process_event(event)
        
        return {
            'statusCode': 200,
            'body': json.dumps(result)
        }
    
    except BusinessError as e:
        # 재시도해도 소용 없는 오류 → 로그만 남기고 성공 반환
        logger.error(f"비즈니스 오류 (재시도 안 함): {str(e)}")
        return {
            'statusCode': 400,
            'body': json.dumps({'error': str(e)})
        }
    
    except TransientError as e:
        # 재시도 가능한 오류 → 예외 발생시켜 Lambda 재시도 유도
        logger.warning(f"일시적 오류 (재시도 예정): {str(e)}")
        raise  # Lambda가 재시도하도록 예외 다시 발생
    
    except Exception as e:
        logger.error(f"예상치 못한 오류: {traceback.format_exc()}")
        raise

def process_event(event):
    # 비즈니스 로직 구현
    pass
```

```bash
# 예약 동시성 설정 (함수 보호)
aws lambda put-function-concurrency \
  --function-name my-api-function \
  --reserved-concurrent-executions 300

# 예약 동시성 제거 (공유 풀 사용)
aws lambda delete-function-concurrency \
  --function-name my-api-function

# 프로비저닝된 동시성 설정
aws lambda put-provisioned-concurrency-config \
  --function-name my-api-function \
  --qualifier prod \
  --provisioned-concurrent-executions 10

# DLQ 설정
aws lambda update-function-configuration \
  --function-name my-function \
  --dead-letter-config TargetArn=arn:aws:sqs:ap-northeast-2:123:my-dlq

# Lambda Destinations 설정
aws lambda put-function-event-invoke-config \
  --function-name my-function \
  --maximum-retry-attempts 2 \
  --maximum-event-age-in-seconds 3600 \
  --destination-config '{
    "OnSuccess": {
      "Destination": "arn:aws:events:ap-northeast-2:123:event-bus/default"
    },
    "OnFailure": {
      "Destination": "arn:aws:sqs:ap-northeast-2:123:failure-queue"
    }
  }'
```

---

## 📝 연습 문제

**문제 1.** Lambda 함수의 예약 동시성을 0으로 설정하면 어떻게 되는가?

A) 함수가 삭제된다  
B) 모든 요청이 스로틀되어 함수가 실행되지 않는다  
C) 함수가 1개만 동시에 실행된다  
D) 기본 동시성 한도가 적용된다  

**정답: B**  
해설: 예약 동시성을 0으로 설정하면 함수에 대한 모든 요청이 스로틀됩니다. 이는 함수를 일시적으로 비활성화하는 방법으로 사용할 수 있습니다.

---

**문제 2.** Lambda 비동기 호출에서 함수가 계속 실패하면 어떻게 되는가?

A) 무한히 재시도한다  
B) 이벤트가 즉시 삭제된다  
C) 최대 2회 재시도 후 DLQ 또는 Destinations 실패 대상으로 이벤트 전송  
D) SNS를 통해 관리자에게 알림을 보낸다  

**정답: C**  
해설: Lambda 비동기 호출은 최대 2회 자동 재시도합니다. 최종 실패 시 DLQ(설정된 경우) 또는 Lambda Destinations의 실패 대상으로 이벤트가 전송됩니다.

---

**문제 3.** DLQ(Dead Letter Queue) 대신 Lambda Destinations를 권장하는 이유는?

A) DLQ보다 저렴하기 때문에  
B) 성공 이벤트도 처리 가능하고 더 많은 대상을 지원하기 때문에  
C) 설정이 더 간단하기 때문에  
D) 더 많은 재시도를 지원하기 때문에  

**정답: B**  
해설: Lambda Destinations는 성공/실패 모두 설정 가능하며, DLQ(SQS, SNS만)보다 더 많은 대상(SQS, SNS, EventBridge, Lambda)을 지원합니다.

---

**문제 4.** 1,000개/초의 요청을 처리하는 Lambda 함수의 평균 실행 시간이 200ms일 때 필요한 동시성은?

A) 50  
B) 100  
C) 200  
D) 1000  

**정답: C**  
해설: 동시성 = 초당 요청 수 × 평균 실행 시간(초) = 1,000 × 0.2 = 200

---

**문제 5.** 프로비저닝된 동시성(Provisioned Concurrency)의 주요 목적은?

A) 함수 실행 비용 절감  
B) 더 많은 메모리 할당  
C) 콜드 스타트 제거로 일관된 응답 시간 보장  
D) 더 긴 타임아웃 설정  

**정답: C**  
해설: 프로비저닝된 동시성은 미리 초기화된 실행 환경을 유지하여 콜드 스타트를 완전히 제거합니다. API와 같이 일관된 응답 시간이 중요한 애플리케이션에 사용됩니다.

---

## 📌 오늘의 요약

1. 동시성 = 초당 요청 수 × 평균 실행 시간, 리전별 기본 한도 1,000
2. 예약 동시성: 함수별 한도 설정, 0으로 설정 시 함수 완전 비활성화
3. 프로비저닝된 동시성: 미리 초기화로 콜드 스타트 완전 제거 (추가 비용 발생)
4. 비동기 오류: 최대 2회 재시도 → DLQ 또는 Destinations 실패 대상
5. Lambda Destinations가 DLQ보다 최신이며 성공 이벤트 처리 및 더 많은 대상 지원
