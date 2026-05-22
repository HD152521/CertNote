# Day 48 - CloudTrail, EventBridge

📅 날짜: 2026년 7월 21일 (화요일)  
🎯 주제: AWS CloudTrail & EventBridge  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudTrail로 AWS API 호출 감사 로그를 관리한다
- EventBridge로 이벤트 기반 아키텍처를 구현한다
- CloudTrail과 EventBridge를 통합한다

---

## 📖 이론 내용

### 1. AWS CloudTrail

AWS 계정의 모든 API 호출을 기록하는 감사(Audit) 서비스입니다.

**CloudTrail 이벤트 유형:**
- **Management Events**: AWS 리소스 변경 (EC2 생성, S3 버킷 정책 변경 등)
- **Data Events**: 데이터 접근 (S3 GetObject, Lambda 호출 등), 기본 비활성화
- **Insight Events**: 비정상적인 활동 감지

```bash
# CloudTrail 이벤트 조회
aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=Username,AttributeValue=admin \
    --start-time 2026-07-01T00:00:00Z \
    --end-time 2026-07-21T00:00:00Z

# 특정 서비스 이벤트 조회
aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket
```

**CloudTrail 보존 및 분석:**
```
CloudTrail → S3 버킷 (장기 보존)
          → CloudWatch Logs (실시간 모니터링)
          → Athena (SQL로 분석)
```

**⭐ 기본 이벤트 기록**: 90일 (이후 S3에 아카이빙 필요)

### 2. CloudTrail Insights

비정상적인 API 활동을 자동으로 감지합니다:

```json
{
  "예시": "IAM 사용자가 갑자기 100개의 S3 버킷을 30분 만에 삭제",
  "Insights 이벤트": {
    "EventName": "DeleteBucket",
    "InsightType": "ApiCallRateInsight",
    "비정상 감지": "평상시 대비 10배 이상의 호출"
  }
}
```

### 3. Amazon EventBridge

AWS 서비스, SaaS 앱, 사용자 정의 이벤트를 처리하는 서버리스 이벤트 버스입니다.

**이벤트 소스:**
- AWS 서비스 (EC2 상태 변경, S3 업로드 등)
- SaaS 파트너 (Salesforce, Zendesk 등)
- 사용자 정의 애플리케이션

**EventBridge 규칙 예시:**

```json
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": {
    "state": ["terminated"]
  }
}
```

```python
# 사용자 정의 이벤트 전송
import boto3

events = boto3.client('events')

events.put_events(
    Entries=[
        {
            'Source': 'myapp.orders',
            'DetailType': 'OrderCreated',
            'Detail': '{"orderId": "O001", "amount": 50000}',
            'EventBusName': 'default'
        }
    ]
)
```

### 4. EventBridge 대상

```
EventBridge 규칙 → 대상 (Target)
                    |
                    +-- Lambda 함수
                    +-- SNS 주제
                    +-- SQS 큐
                    +-- Step Functions
                    +-- ECS 작업
                    +-- API Gateway
                    +-- Kinesis Data Streams
                    +-- CodePipeline
```

### 5. CloudTrail + EventBridge 통합

```
[AWS API 호출] → [CloudTrail]
                      |
                      | Management Event
                      v
                [EventBridge]
                      |
                      | 조건 매칭
                      v
                [Lambda] → [SNS 알림]
                
예: root 계정 로그인 감지 → 즉시 알림
```

---

## 🧠 알아두면 좋은 심화 이론

### CloudTrail 이벤트 유형 3종 정확히

| 유형 | 기본 | 비용 | 예시 |
|------|------|------|------|
| **Management Events** | **활성화** (기본) | 90일 무료 | EC2 RunInstances, IAM CreateUser |
| **Data Events** | **비활성화** | 활성화 시 과금 | S3 GetObject, Lambda Invoke, DynamoDB API |
| **Insights Events** | 비활성화 | 추가 비용 | 비정상 API 호출 패턴 |

### CloudTrail 보존 (시험 빈출)

```
콘솔 / API 조회: 90일 (기본 제공)
S3 Trail:        무제한 (사용자 설정)
CloudTrail Lake: 7일~10년 (관리형 데이터 레이크)
```

### Trail 종류

| 종류 | 범위 |
|------|------|
| **Single-region trail** | 한 리전만 |
| **Multi-region trail** | 모든 리전 (권장) |
| **Organization trail** | AWS Organizations 모든 계정 |

> 💡 시험에 "전체 계정 + 모든 리전 감사" → **Organization Multi-region trail**.

### CloudTrail Lake (2022 신규)

- CloudTrail 이벤트의 관리형 데이터 레이크
- SQL로 쿼리 (Athena 같은 경험)
- 7년 보존
- 시험에 가끔: "장기간 CloudTrail 분석" → CloudTrail Lake

### EventBridge 핵심 구성 요소

| 구성 요소 | 역할 |
|----------|------|
| **Event Bus** | 이벤트의 통로 (default, custom, SaaS) |
| **Rule** | 이벤트 필터링 패턴 |
| **Target** | 이벤트가 도달할 곳 (20+ AWS 서비스) |
| **Schema Registry** | 이벤트 스키마 저장·디스커버리 |
| **Pipes** | 통합 이벤트 파이프라인 (Source→Filter→Enrichment→Target) |

### Event Bus 3종

| 유형 | 사용 |
|------|------|
| **Default Bus** | AWS 서비스 이벤트 자동 수신 |
| **Custom Bus** | 사용자 정의 앱 이벤트 |
| **Partner Bus (SaaS)** | Datadog, MongoDB, Zendesk 등 |

### EventBridge 패턴 매칭 (시험 출제)

```json
{
  "source": ["aws.s3"],
  "detail-type": ["Object Created"],
  "detail": {
    "bucket": { "name": ["my-bucket"] },
    "object": { "size": [{ "numeric": [">", 1000000] }] }
  }
}
```

지원 매처: prefix, suffix, anything-but, numeric, exists, equals-ignore-case, wildcard.

### EventBridge Pipes (2022 신규)

```
Source (SQS/Kinesis/DDB/MQ) → Filter → Enrichment(Lambda) → Target
```

- 점-투-점 통합 (Lambda 없이도 변환·필터링)
- 시험에 가끔: "여러 서비스를 연결하는 파이프라인" → Pipes

### Schedule (cron / rate)

```
rate(5 minutes)              # 5분마다
rate(1 hour)
cron(0 9 * * ? *)            # 매일 9시
cron(0/5 * * * ? *)          # 5분마다 (cron 방식)
```

- **EventBridge Scheduler** (2022 신규): 백만 개 스케줄 관리, 일회성 일정 가능

### CloudTrail → EventBridge 패턴 (실무)

```
[Console 로그인] → CloudTrail → Event "ConsoleLogin"
                                 ↓
                               EventBridge Rule (root 계정 필터)
                                 ↓
                               Lambda → SNS → Slack/이메일
```

### Cross-Account & Cross-Region Event

- EventBridge Rule이 다른 계정/리전의 Event Bus로 이벤트 전송 가능
- 시험에 가끔: "중앙 계정에서 모든 이벤트 수집" → Organization 이벤트 라우팅

### 관련 서비스 Cross-Reference

- **CloudTrail ↔ Athena** → S3 로그에 SQL 쿼리
- **EventBridge ↔ Step Functions** → 이벤트 트리거 워크플로
- **EventBridge ↔ Lambda** → [Week 3 Day 2]
- **EventBridge Scheduler ↔ Lambda** → cron 대체

---

## 아키텍처 다이어그램

```
CloudTrail 감사 아키텍처
================================

모든 AWS API 호출
     |
     v
[CloudTrail]
     |
     +---> [S3] (90일 이후 장기 보존)
     |
     +---> [CloudWatch Logs] (실시간 모니터링)
                |
                v
          [CloudWatch 알람]
                |
                v
          [SNS 알림]

EventBridge 이벤트 버스
================================

[EC2] [S3] [RDS] [사용자 앱]
          |
          v
    [EventBridge]
          |
     조건 매칭
          |
    +-----+-----+
    |     |     |
[Lambda] [SQS] [SNS]
```

---

## ⭐ 핵심 포인트

1. ⭐ **CloudTrail**: 모든 AWS API 호출 기록, 기본 90일 보존
2. ⭐ **Data Events**: S3 Object 접근, Lambda 호출 기록, 기본 비활성화
3. ⭐ **CloudTrail Insights**: 비정상 API 활동 자동 감지
4. ⭐ **EventBridge**: 이벤트 기반 아키텍처, 18개 이상 대상
5. ⭐ **root 로그인 감지**: CloudTrail → EventBridge → SNS 알림 패턴

---

## 📝 연습 문제

**문제 1.** AWS 계정에서 누가 S3 버킷을 삭제했는지 확인하려면?

A) CloudWatch Logs  
B) CloudTrail  
C) X-Ray  
D) VPC Flow Logs  

**정답: B** - CloudTrail은 모든 AWS API 호출을 기록하므로 DeleteBucket 이벤트에서 누가 실행했는지 확인할 수 있습니다.

---

**문제 2.** CloudTrail Data Events의 특징은?

A) 기본 활성화, 추가 비용 없음  
B) 기본 비활성화, 활성화 시 추가 비용  
C) 관리형 이벤트보다 중요도 낮음  
D) S3에만 적용됨  

**정답: B** - Data Events(S3 GetObject, Lambda 호출 등)는 기본 비활성화 상태이며 활성화하면 추가 비용이 발생합니다.

---

**문제 3.** root 계정 로그인을 실시간으로 감지하여 알림을 보내려면?

A) CloudWatch Metrics 알람  
B) CloudTrail → EventBridge → SNS  
C) GuardDuty만으로 가능  
D) IAM 정책으로 방지  

**정답: B** - CloudTrail에서 root 로그인 이벤트를 EventBridge로 라우팅하고 SNS로 알림을 보낼 수 있습니다.

---

**문제 4.** EventBridge와 SNS의 차이점은?

A) 속도 차이  
B) EventBridge는 이벤트 기반 라우팅과 필터링, SNS는 단순 구독/알림  
C) 비용 차이  
D) 지역 제한  

**정답: B** - EventBridge는 세밀한 이벤트 필터링과 다양한 대상 라우팅을 지원하고, SNS는 주제 기반 단순 발행/구독 모델입니다.

---

**문제 5.** CloudTrail 이벤트의 기본 보존 기간은?

A) 7일  
B) 30일  
C) 90일  
D) 1년  

**정답: C** - CloudTrail 이벤트는 기본 90일 동안 보존됩니다. 장기 보존은 S3로 아카이빙해야 합니다.

---

## 📌 오늘의 요약

1. CloudTrail: 모든 AWS API 감사, 기본 90일, S3로 장기 보존
2. Data Events: S3/Lambda 데이터 접근 기록, 기본 비활성화
3. CloudTrail Insights: 비정상 API 활동 자동 감지
4. EventBridge: 이벤트 기반 아키텍처, AWS/SaaS/사용자 이벤트 처리
5. CloudTrail + EventBridge: root 로그인, 보안 이벤트 실시간 알림
