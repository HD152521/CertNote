# Day 2 - X-Ray 샘플링, 그룹, Service Map 운영

📅 날짜: Week 11 (Day 2)
🎯 주제: 운영 규모에서 X-Ray 비용/시각화 튜닝
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Sampling Rule 설계
- X-Ray Group으로 Service Map 슬라이스
- Trace 검색 표현식
- X-Ray Insights 자동 이상 탐지

---

## 🧩 사전 지식 (CS 기초)

- **Reservoir Sampling**: 처음 N개는 모두 수집, 이후는 비율로.
- **Service Map Slice**: 전체 맵 중 일부 필터링.
- **Latency p99**: 상위 1% 가장 느린 호출.
- **Trace Search Expression**: 인덱싱된 필드 검색 DSL.

---

## 📖 이론 내용

### 1. Sampling Rule

```json
{
  "RuleName": "DefaultRule",
  "ResourceARN": "*",
  "Priority": 9000,
  "FixedRate": 0.05,
  "ReservoirSize": 1,
  "ServiceName": "*",
  "ServiceType": "*",
  "Host": "*",
  "HTTPMethod": "*",
  "URLPath": "*"
}
```

- **ReservoirSize**: 매 초당 무조건 N개 수집 (낮은 트래픽 보장)
- **FixedRate**: Reservoir 초과 시 비율로 (예: 5%)
- **Priority**: 낮을수록 먼저 평가
- **ServiceName/Host/HTTPMethod**: 매칭 조건

**시나리오:**
- 결제 API: 100% 수집 (Reservoir 1000, FixedRate 1.0)
- 헬스체크: 0% (Reservoir 0, FixedRate 0)
- 일반: 5%

```bash
aws xray create-sampling-rule --sampling-rule '{
  "RuleName": "checkout-full",
  "Priority": 100,
  "ReservoirSize": 100,
  "FixedRate": 1.0,
  "URLPath": "/checkout/*",
  "ServiceName": "checkout-api",
  ...
}'
```

### 2. X-Ray Group

전체 Service Map을 필터링한 슬라이스:
```bash
aws xray create-group \
  --group-name PaymentService \
  --filter-expression 'service("payment-api") OR service("billing")'
```

콘솔에서 Group 선택 시 해당 서비스만 표시. 큰 조직에서 팀별/서비스별 분리에 유용.

### 3. Trace Search Expression

```
service("checkout-api") AND http.status = 500
annotation.OrderId = "abc123"
duration > 1
responsetime > 0.5 AND http.url CONTAINS "/api/v2/"
trace.json.fault = true
```

연산자: AND/OR/NOT, =, !=, CONTAINS, > <.

### 4. X-Ray Insights

자동 이상 탐지 (2020+):
- 정상 baseline 학습
- 비정상 latency/error 패턴 발견 시 Insight 생성
- EventBridge → Lambda → 알림 자동화 가능

```json
{
  "source": ["aws.xray"],
  "detail-type": ["AWS X-Ray Insight Update"]
}
```

### 5. Filter Expression 운영 패턴

| 질문 | Expression |
|------|-----------|
| 결제 API의 500 에러 trace | `service("checkout") AND http.status = 500` |
| p99 느린 요청 (>2초) | `duration > 2` |
| 특정 사용자 추적 | `annotation.UserId = "u-123"` |
| DynamoDB throttle | `service("dynamodb") AND error.cause CONTAINS "ProvisionedThroughputExceededException"` |

### 6. Cross-Account X-Ray

(Limited) Cross-Account Observability로 X-Ray Trace를 Monitoring Account에서 통합 조회.

---

## 🧠 알아두면 좋은 심화 이론

### Sampling 비용 절감

- 1000 req/s × 100% = 1000 trace/s → 비용 ↑
- ReservoirSize 1 + FixedRate 1% → 약 1 + 10/s = 11 trace/s
- 비즈니스 critical path만 100%

### Powertools와 Sampling

Powertools Tracer는 환경 변수 `POWERTOOLS_TRACER_CAPTURE_RESPONSE=false`로 응답 메타데이터 제외 — 큰 페이로드 비용 절감.

### Trace Source 통합

- API Gateway, Lambda, EC2, ECS Task, EKS Pod, ELB
- App Mesh / Service Connect 통합 (envoy → X-Ray)

### Trace + Metric 상관관계

Service Map의 알람 발생 노드 클릭 → 동시간대 metric/log/trace 통합 보기.

### 관련 서비스 Cross-Reference

- **ADOT** → Week 11 Day 3
- **OpenSearch trace** → Week 11 Day 4
- **EventBridge Insight** → Week 12 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
X-Ray Sampling Strategy
==================================================

  Incoming requests
        │
        ▼
   Sampling Rules (priority order)
   ├─ checkout/* → 100% (Reservoir 100)
   ├─ /api/* → 5% (Reservoir 1)
   ├─ /health → 0%
   └─ * → 5% (default)
        │
        ▼
   Selected traces only
        │
        ▼
   X-Ray Service
        │
        ▼
   Service Map + Trace search + Insights
   Groups: PaymentService / OrdersService / etc.
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Sampling Rule = Reservoir(초당 보장) + FixedRate(비율) + 매칭 조건
2. ⭐ Priority 낮을수록 먼저 평가 (Default 9000 가장 마지막)
3. ⭐ Group으로 Service Map 슬라이싱
4. ⭐ Annotation 기반 trace 검색 (`annotation.OrderId = ...`)
5. ⭐ X-Ray Insights가 자동 이상 탐지 + EventBridge 통합

---

## 💻 실제 예시

```bash
# 결제 100% + 헬스 0% + 기본 5%
aws xray create-sampling-rule --sampling-rule '{"RuleName":"checkout","Priority":100,"ReservoirSize":100,"FixedRate":1.0,"ServiceName":"*","ServiceType":"*","Host":"*","HTTPMethod":"*","URLPath":"/checkout/*","Version":1,"ResourceARN":"*"}'

aws xray create-sampling-rule --sampling-rule '{"RuleName":"health","Priority":200,"ReservoirSize":0,"FixedRate":0.0,"URLPath":"/health","ServiceName":"*","ServiceType":"*","Host":"*","HTTPMethod":"*","Version":1,"ResourceARN":"*"}'
```

---

## 📝 연습 문제

**1.** Sampling Rule의 ReservoirSize 의미?  A) 비율 B) 초당 무조건 수집 보장 수 C) 메모리 D) Region  **정답: B**

**2.** "/health 엔드포인트 trace 비활성"?  A) Reservoir 0 + FixedRate 0 + URLPath /health 매칭 + Priority 낮게 B) IAM C) Layer D) DynamoDB  **정답: A**

**3.** X-Ray Group 용도?  A) 전체 Service Map을 service/annotation으로 필터 슬라이싱 B) IAM Group C) Region D) ECR  **정답: A**

**4.** "특정 OrderId의 trace 찾기"?  A) `annotation.OrderId = "..."` 검색 (Powertools가 annotation으로 추가) B) Logs C) Lambda D) Subsegment 이름  **정답: A**

**5.** X-Ray Insights 알림 자동화?  A) EventBridge → Lambda → SNS B) Trusted Advisor C) Config D) Synthetics  **정답: A**

**6.** Sampling Priority가 9000인 Rule?  A) 가장 먼저 평가 B) 가장 마지막 (Default) C) 무시 D) Auto  **정답: B**

**7.** 결제 100% trace + 일반 5%의 가장 적절한 구성?  A) 결제용 Rule Priority 낮게(먼저 평가) Reservoir 큼 FixedRate 1.0, 일반 Default 5% B) 모두 100% C) 모두 5% D) Lambda 우회  **정답: A**

---

## 📌 오늘의 요약

1. Sampling Rule = Reservoir + FixedRate + 매칭 조건
2. Priority 낮을수록 먼저 평가
3. Group으로 Service Map 슬라이스
4. Annotation 기반 trace 검색
5. X-Ray Insights 자동 이상 탐지
