# Day 1 - X-Ray 기본 - 세그먼트, 서브세그먼트, Trace

📅 날짜: Week 11 (Day 1)
🎯 주제: 분산 추적의 기본 모델
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Trace / Segment / Subsegment 계층
- X-Ray SDK 자동 instrumentation
- Service Map 읽는 법
- Active vs Passive Tracing

---

## 🧩 사전 지식 (CS 기초)

- **Distributed Tracing**: 마이크로서비스 호출 사슬을 단일 추적으로.
- **Trace ID**: 분산 호출에 걸쳐 유지되는 식별자.
- **Span / Segment**: 단일 서비스 내 작업.
- **Sampling**: 모든 요청을 추적하지 않음 (비용).

---

## 📖 이론 내용

### 1. Trace 계층

```
Trace (1 사용자 요청)
 ├─ Segment (서비스 A) — 1개 노드의 작업
 │   ├─ Subsegment (DynamoDB call)
 │   ├─ Subsegment (Lambda invoke)
 │   └─ Subsegment (Custom code block)
 └─ Segment (서비스 B)
     └─ Subsegment (...)
```

**Trace ID**: `1-65500000-1234abcd...` (시간 + 랜덤). Header `X-Amzn-Trace-Id`로 전파.

### 2. Active vs Passive Tracing

- **Active**: 서비스가 트리거하는 다운스트림 호출에 Trace ID 자동 부여
- **Passive**: 외부에서 들어온 Trace ID를 따라가기만

**Active Tracing 활성화:**
- Lambda: `--tracing-config Mode=Active`
- API Gateway: Stage 설정에서
- ECS: Task Definition에 환경 변수 + Sidecar Daemon

### 3. SDK / Auto-Instrumentation

**Lambda Python:**
```python
from aws_xray_sdk.core import patch_all, xray_recorder
patch_all()   # boto3, requests, mysql 등 자동 패치

@xray_recorder.capture('business_logic')
def process(order):
    # ...
```

**Powertools (권장):**
```python
from aws_lambda_powertools import Tracer
tracer = Tracer(service="checkout")

@tracer.capture_lambda_handler
def handler(event, context):
    tracer.put_annotation(key="OrderId", value=event['order_id'])
    process(event)

@tracer.capture_method
def process(event):
    ...
```

### 4. Annotation vs Metadata

- **Annotation**: 인덱싱됨 → 필터/검색 가능 (예: `OrderId`, `UserId`)
- **Metadata**: 인덱싱 안 됨 → 추가 디버그 정보 (큰 페이로드)

```python
tracer.put_annotation(key="UserId", value=user_id)
tracer.put_metadata(key="RequestBody", value=event_body)
```

### 5. Service Map

X-Ray 자동 생성:
- 노드: 서비스 (Lambda 함수, API Gateway, RDS 등)
- 엣지: 호출 관계 + 응답 시간 + 에러율
- 클릭으로 해당 노드의 Trace 목록 → 개별 Trace 분석

문제 해석:
- 빨강 노드: 에러율 ↑
- 굵은 엣지: 호출량 ↑
- 느린 엣지: latency ↑

### 6. Tracing Header 전파

```
X-Amzn-Trace-Id: Root=1-65500000-1234abcd; Parent=53995c3f42cd8ad8; Sampled=1
```

- `Root`: Trace ID
- `Parent`: 호출자 Segment ID
- `Sampled`: 샘플링 결정 (1=수집)

HTTP 헤더로 자동 전파. boto3 patch 시 SDK가 자동 처리.

---

## 🧠 알아두면 좋은 심화 이론

### X-Ray Daemon (EC2/ECS/EKS)

X-Ray 서비스에 직접 전송 X — 로컬 Daemon이 UDP로 받아 배치 전송.
- ECS Sidecar 컨테이너로 실행
- EC2에 systemd 서비스
- EKS DaemonSet

Lambda는 Daemon 불필요 — 자동 통합.

### Anomaly Detection on Service Map

X-Ray Insights: 자동으로 비정상 패턴 탐지 (latency, error rate 급증). Lambda → SNS 자동화 가능.

### Custom Subsegment

```python
with xray_recorder.in_subsegment('db_query'):
    result = db.execute(query)
    xray_recorder.current_subsegment().put_metadata('rows', len(result))
```

비즈니스 로직 단위로 시간 분석.

### X-Ray Trace Retention

기본 30일. 변경 불가. 장기 보관 필요 시 외부 시스템 export.

### 관련 서비스 Cross-Reference

- **X-Ray Sampling** → Week 11 Day 2
- **ADOT** → Week 11 Day 3
- **Powertools** → Week 10 Day 3
- **Service Map → 알람** → Week 12 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
X-Ray Trace Flow
==================================================

  User → API Gateway → Lambda A → Lambda B → DynamoDB
              │ (active tracing)
              ▼
  X-Ray Service collects segments
   Trace ID: 1-65500000-...
    ├─ APIGW segment (3ms)
    ├─ Lambda A segment (150ms)
    │   ├─ subsegment: Init (50ms)
    │   ├─ subsegment: business_logic (80ms)
    │   └─ subsegment: invoke Lambda B (20ms)
    ├─ Lambda B segment (15ms)
    │   └─ subsegment: dynamodb:GetItem (10ms)
    └─ ...

  Service Map (auto):
    APIGW → LambdaA → LambdaB → DynamoDB
    (latency, error% on each edge)

  Detection:
   X-Ray Insights triggers when latency p99 spikes
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Trace > Segment > Subsegment 계층
2. ⭐ Active Tracing이 자동 Trace ID 부여, Passive는 외부 ID만 따라감
3. ⭐ Annotation(인덱싱) vs Metadata(인덱싱 안 됨)
4. ⭐ X-Ray Daemon은 EC2/ECS/EKS 필요, Lambda는 자동
5. ⭐ Service Map이 문제 노드 시각화 + Insights가 자동 이상 탐지

---

## 💻 실제 예시

```python
from aws_lambda_powertools import Tracer, Logger
tracer = Tracer(service="checkout")
logger = Logger()

@tracer.capture_lambda_handler
def handler(event, context):
    order_id = event['order_id']
    tracer.put_annotation(key="OrderId", value=order_id)
    tracer.put_metadata(key="rawEvent", value=event)
    process(order_id)

@tracer.capture_method
def process(order_id):
    # 외부 호출은 boto3 patch로 자동 subsegment
    table = boto3.resource('dynamodb').Table('orders')
    table.put_item(Item={'id': order_id, 'status': 'pending'})
```

```bash
# CDK/SAM에서 Active Tracing
# SAM
Globals:
  Function:
    Tracing: Active

# API Gateway
aws apigateway update-stage \
  --rest-api-id abc --stage-name prod \
  --patch-operations op=replace,path=/tracingEnabled,value=true
```

---

## 📝 연습 문제

**문제 1.** X-Ray Trace 계층은?  A) Trace > Segment > Subsegment B) Span > Trace C) Log > Metric D) Event  **정답: A**

**문제 2.** Annotation과 Metadata 차이?  A) 동일 B) Annotation은 인덱싱(검색 가능), Metadata는 추가 정보(인덱싱 안 됨) C) Annotation은 1개만 D) Metadata는 무료  **정답: B**

**문제 3.** EC2에서 X-Ray 전송 방법?  A) 직접 X-Ray API B) X-Ray Daemon (UDP) 통해 배치 전송 C) Lambda 우회 D) S3  **정답: B**

**문제 4.** Active Tracing의 효과?  A) 비용 절감 B) 서비스가 호출하는 다운스트림에 자동 Trace ID 부여 C) Layer 추가 D) IAM 자동  **정답: B**

**문제 5.** Powertools Tracer가 자동 제공?  A) X-Ray 세그먼트 자동 + Annotation/Metadata 헬퍼 B) IAM 회전 C) Pipeline D) ECR  **정답: A**

**문제 6.** Service Map에서 굵고 빨간 엣지?  A) 호출량 많음 + 에러율 높음 B) 비용 절감 C) 정상 D) Throttle  **정답: A**

**문제 7.** X-Ray Trace 기본 retention?  A) 7일 B) 30일 (변경 불가) C) 무제한 D) 1일  **정답: B**

---

## 📌 오늘의 요약

1. Trace > Segment > Subsegment
2. Active Tracing = 자동 ID, Passive = ID 전파만
3. Annotation 검색 가능, Metadata는 디버그용
4. Lambda는 자동, EC2/ECS/EKS는 X-Ray Daemon
5. Service Map + Insights로 문제 자동 시각화
