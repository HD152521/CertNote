# Day 51 - SQS: 메시지 큐

📅 날짜: 2026년 7월 26일 (일요일)  
🎯 주제: Amazon SQS  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SQS 표준 큐와 FIFO 큐의 차이를 이해한다
- SQS 주요 파라미터를 설정한다
- Lambda와 SQS를 통합하여 비동기 처리를 구현한다

---

## 📖 이론 내용

### 1. Amazon SQS란?

서비스 간 메시지를 비동기로 전달하는 완전 관리형 메시지 큐 서비스입니다.

**핵심 특성:**
- 완전 관리형, 서버리스
- 무제한 처리량
- 최소 1회 전달 (At-Least-Once Delivery)
- 메시지 최대 크기: 256KB
- 기본 보존 기간: 4일 (최대 14일)

### 2. SQS 표준 큐 vs FIFO 큐

| 특성 | 표준 큐 | FIFO 큐 |
|------|---------|---------|
| 순서 | 순서 보장 없음 | 선입선출 보장 |
| 중복 | 중복 가능 | 중복 제거 |
| 처리량 | 무제한 | 초당 300개 (배치 3000개) |
| 가격 | 저렴 | 비교적 비쌈 |
| 사용처 | 높은 처리량 | 금융 거래, 순서 중요 |

### 3. SQS 주요 파라미터

```python
import boto3

sqs = boto3.client('sqs')

# 큐 생성
response = sqs.create_queue(
    QueueName='my-queue',
    Attributes={
        'VisibilityTimeout': '30',          # 처리 중 메시지 숨김 시간 (초)
        'MessageRetentionPeriod': '86400',  # 메시지 보존 기간 (초, 1일)
        'ReceiveMessageWaitTimeSeconds': '20', # 롱 폴링 (최대 20초)
        'DelaySeconds': '0'                 # 메시지 전달 지연 (초)
    }
)

# 메시지 전송
sqs.send_message(
    QueueUrl=response['QueueUrl'],
    MessageBody='{"orderId": "O001", "amount": 50000}',
    DelaySeconds=5,  # 5초 후 수신 가능
    MessageAttributes={
        'OrderType': {
            'DataType': 'String',
            'StringValue': 'premium'
        }
    }
)

# 메시지 수신 (롱 폴링)
messages = sqs.receive_message(
    QueueUrl=response['QueueUrl'],
    MaxNumberOfMessages=10,  # 최대 10개
    WaitTimeSeconds=20       # 20초 롱 폴링
)

# 메시지 처리 후 삭제
for message in messages.get('Messages', []):
    print(message['Body'])
    sqs.delete_message(
        QueueUrl=response['QueueUrl'],
        ReceiptHandle=message['ReceiptHandle']
    )
```

### 4. SQS Visibility Timeout

```
메시지 처리 흐름
================================

[SQS 큐에 메시지]
     |
     | Consumer가 수신
     v
[메시지 숨김 (Visibility Timeout)]
  처리 중... 30초
     |
     +-- 처리 성공 → 메시지 삭제
     |
     +-- 처리 실패/타임아웃 초과 → 큐에 다시 나타남
```

**⭐ 기본값**: 30초 (0초 ~ 12시간)

### 5. Dead Letter Queue (DLQ)

처리에 반복 실패한 메시지를 분리하는 큐:

```python
# DLQ 설정
sqs.set_queue_attributes(
    QueueUrl='https://sqs.../main-queue',
    Attributes={
        'RedrivePolicy': '{"deadLetterTargetArn": "arn:aws:sqs:...:dlq", "maxReceiveCount": "3"}'
    }
)
```

**maxReceiveCount**: 지정 횟수 이상 실패 시 DLQ로 이동

---

## 🧠 알아두면 좋은 심화 이론

### SQS 핵심 한도 (시험 빈출 - 숫자 외우기)

| 항목 | 값 |
|------|-----|
| 메시지 최대 크기 | **256 KB** (S3와 연동 시 2GB Extended Library) |
| 보존 기간 | 60초 ~ **14일** (기본 4일) |
| 가시성 타임아웃 | 0초 ~ **12시간** (기본 30초) |
| 메시지 지연 | 0초 ~ 15분 (Delay Queue) |
| 메시지 그룹 (FIFO) | 메시지 그룹 단위 순서 보장 |
| **표준 큐 처리량** | **무제한** |
| **FIFO 큐 처리량** | 300 msg/s (배치 3000 msg/s), 고처리량 모드 시 70,000 msg/s |
| 인-flight 메시지 | 표준 120,000 / FIFO 20,000 |

### Short Polling vs Long Polling (시험 자주)

| 항목 | Short | Long |
|------|-------|------|
| WaitTimeSeconds | 0 (기본) | 1~20초 |
| 빈 응답 발생 | 자주 | 거의 없음 |
| API 호출 비용 | 높음 | 낮음 |
| 권장 | ❌ | ✅ |

> 💡 큐 레벨에서 `ReceiveMessageWaitTimeSeconds=20` 기본 설정 권장.

### 메시지 가시성 타임아웃 디테일

```
메시지 수신
   ↓ 가시성 타임아웃 시작 (기본 30초)
처리 중...
   ↓
   ┌─ 처리 성공 → DeleteMessage → 큐에서 영구 삭제
   ├─ 타임아웃 초과 → 큐에 재출현
   └─ ChangeMessageVisibility로 연장 가능
```

> ⚠️ **함정**: 처리 시간이 가시성 타임아웃보다 길면 **같은 메시지 중복 처리** 위험. Lambda는 함수 타임아웃의 6배 이상 가시성 타임아웃 권장.

### FIFO 큐 추가 디테일 (시험 자주)

- 이름이 **`.fifo` 접미사** 필수
- **MessageDeduplicationId**: 5분 이내 중복 메시지 제거
- **ContentBasedDeduplication**: SHA-256 해시 자동 dedup
- **MessageGroupId**: 같은 그룹은 순서 보장, 다른 그룹은 병렬 처리

```python
sqs.send_message(
    QueueUrl='.../my-queue.fifo',
    MessageBody='order data',
    MessageGroupId='customer-123',           # 그룹 내 순서 보장
    MessageDeduplicationId='order-001'       # 5분 dedup
)
```

### 고처리량 FIFO (High-Throughput FIFO)

- 표준 FIFO: 300 msg/s
- 고처리량 모드: **70,000 msg/s** (per group)
- 활성화: 큐 속성에서 `FifoThroughputLimit=perMessageGroupId`

### Delay Queue vs Message Delay vs Visibility Timeout

| 기능 | 시점 | 적용 |
|------|------|------|
| **Delay Queue** | 생성 시 큐 속성 | 모든 새 메시지 |
| **Message Timer** | 메시지 전송 시 | 개별 메시지 |
| **Visibility Timeout** | 메시지 수신 후 | 처리 중 숨김 |

### SQS Extended Client Library

- 256KB 초과 메시지는 **S3에 저장 + 큐엔 참조** (최대 2GB)
- Java/Python SDK 제공
- 시험에 한 번씩: "큰 메시지 처리" → Extended Client

### SQS 권한 모델

- **SQS Access Policy** (리소스 기반): 다른 계정 접근, SNS 구독
- **IAM Policy**: 같은 계정 내 권한

### SQS 암호화

- **SSE-SQS** (기본): AWS 관리
- **SSE-KMS**: 고객 키 (감사 + 회전)
- 클라이언트 사이드 암호화 가능

### DLQ 디테일 (시험 매우 빈출)

- DLQ는 **같은 유형** (표준 ↔ 표준, FIFO ↔ FIFO)
- 보존 기간: DLQ 도착 시각 기준 (큐 보존 시간 따로 계산)
- **재구동 (Redrive)**: DLQ → 원본 큐로 다시 보내기 (AWS 콘솔)

### 관련 서비스 Cross-Reference

- **SQS + Lambda** → [Week 3 Day 2] ESM
- **SQS + SNS 팬아웃** → [Day 2]
- **SQS Beanstalk Worker** → [Week 8 Day 4]
- **SQS + EventBridge Pipes** → [Week 10 Day 3]

---

## 아키텍처 다이어그램

```
SQS 비동기 처리 아키텍처
================================

[API Gateway + Lambda (Producer)]
          |
          | 메시지 전송
          v
[SQS 표준 큐]
          |
          | 수신 (롱 폴링)
          v
[Lambda (Consumer)]
          |
          +-- 처리 성공 → 메시지 삭제
          |
          +-- 3회 실패 → [DLQ]
                             |
                             v
                      [알림 + 수동 처리]

FIFO 큐 순서 보장
================================

Producer → [msg1][msg2][msg3][msg4]
Consumer ← msg1 → 처리 완료
Consumer ← msg2 → 처리 완료
(순서 보장)
```

---

## ⭐ 핵심 포인트

1. ⭐ **표준 큐**: 순서/중복 미보장, 무제한 처리량
2. ⭐ **FIFO 큐**: 순서 보장, 중복 제거, 초당 300개
3. ⭐ **Visibility Timeout**: 처리 중 메시지 숨김, 기본 30초
4. ⭐ **롱 폴링**: WaitTimeSeconds=20, 빈 응답 줄임, 비용 절감
5. ⭐ **DLQ**: maxReceiveCount 초과 시 격리, 실패 메시지 분석

---

## 📝 연습 문제

**문제 1.** SQS FIFO 큐의 처리량 제한은?

A) 초당 100개  
B) 초당 300개  
C) 무제한  
D) 초당 1000개  

**정답: B** - FIFO 큐는 초당 300개(배치 사용 시 3000개)의 메시지를 처리할 수 있습니다.

---

**문제 2.** SQS에서 처리 중인 메시지가 다른 Consumer에게 보이지 않도록 하는 설정은?

A) MessageRetentionPeriod  
B) DelaySeconds  
C) VisibilityTimeout  
D) WaitTimeSeconds  

**정답: C** - VisibilityTimeout은 메시지를 수신한 후 일정 시간 동안 다른 Consumer에게 메시지를 숨깁니다.

---

**문제 3.** SQS에서 비용을 절감하고 불필요한 빈 응답을 줄이는 방법은?

A) 메시지 크기 줄이기  
B) 롱 폴링 사용 (WaitTimeSeconds)  
C) 큐 수 줄이기  
D) 메시지 보존 기간 늘리기  

**정답: B** - 롱 폴링은 메시지가 없으면 최대 20초까지 기다리므로 빈 응답을 줄이고 비용을 절감합니다.

---

**문제 4.** DLQ의 목적은?

A) 메시지 전달 속도 향상  
B) 반복 처리 실패 메시지 격리 및 분석  
C) 메시지 암호화  
D) 처리량 향상  

**정답: B** - DLQ는 여러 번 처리에 실패한 메시지를 격리하여 나중에 원인을 분석할 수 있습니다.

---

**문제 5.** 금융 거래 메시지를 순서대로 처리해야 할 때 사용할 큐 유형은?

A) 표준 큐  
B) FIFO 큐  
C) Priority 큐  
D) 지연 큐  

**정답: B** - 금융 거래는 순서가 중요하므로 FIFO 큐를 사용하여 선입선출 순서를 보장해야 합니다.

---

## 📌 오늘의 요약

1. SQS: 완전 관리형 메시지 큐, 최대 256KB, 기본 4일 보존
2. 표준 큐: 무제한 처리량, 순서/중복 미보장
3. FIFO 큐: 순서 보장, 중복 제거, 초당 300개
4. VisibilityTimeout: 처리 중 숨김, 기본 30초, 실패 시 재노출
5. DLQ: maxReceiveCount 초과 메시지 격리, 오류 분석용
