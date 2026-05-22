# Day 3 - Container/Lambda Insights, EMF

📅 날짜: Week 10 (Day 3)
🎯 주제: 워크로드별 심층 관찰성 + Embedded Metric Format
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Container Insights vs Lambda Insights 차이
- EMF 구조와 작성법
- Powertools for AWS Lambda로 표준화
- Cost vs Visibility 트레이드오프

---

## 🧩 사전 지식 (CS 기초)

- **Observability**: 시스템 내부 상태를 외부 출력만으로 추론.
- **Three Pillars**: Logs / Metrics / Traces.
- **High-Cardinality Metric**: 차원 조합이 많음. 비용 영향.
- **Sampling**: 모든 데이터가 아닌 일부만 수집.

---

## 📖 이론 내용

### 1. Container Insights

ECS/EKS Cluster/Service/Task/Pod 메트릭 자동 수집:

| 활성화 위치 | 명령 |
|-------------|------|
| ECS Cluster | `aws ecs update-cluster-settings --cluster X --settings name=containerInsights,value=enabled` |
| EKS Cluster | Helm으로 ADOT Collector 설치 또는 AWS Distro for OpenTelemetry |

수집 메트릭:
- ECS: ServiceCount, TaskCount, CPUUtilization, MemoryUtilization, NetworkRxBytes
- EKS: cluster_failed_node_count, pod_cpu_utilization, namespace_*

**비용**: 추가 메트릭 + 로그 ingestion 발생. 작은 클러스터에선 비싸 보일 수 있음.

### 2. Container Insights enhanced observability for EKS (2024)

- 노드/Pod 수준 강화 메트릭
- `aws cloudwatch describe-anomaly-detectors` 자동 활성

### 3. Lambda Insights

함수별 상세 메트릭 (CPU, Memory, Init duration, Disk):

**활성화:**
- Lambda Layer 추가: `arn:aws:lambda:<region>:580247275435:layer:LambdaInsightsExtension:N`
- IAM Role에 `arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy`

CloudWatch 콘솔에 Multi-function dashboard 자동 생성.

### 4. Embedded Metric Format (EMF)

로그에 JSON으로 메트릭 임베드 → CloudWatch가 자동 추출.

**구조:**
```json
{
  "_aws": {
    "Timestamp": 1716368400000,
    "CloudWatchMetrics": [
      {
        "Namespace": "MyApp/Orders",
        "Dimensions": [["Service","Environment"], ["Service"]],
        "Metrics": [
          {"Name": "OrderCount", "Unit": "Count"},
          {"Name": "OrderValue", "Unit": "None"}
        ]
      }
    ]
  },
  "Service": "checkout",
  "Environment": "prod",
  "OrderCount": 1,
  "OrderValue": 42.5,
  "OrderId": "abc123"   // 메트릭 X, 로그 필드로만
}
```

**핵심:**
- `Dimensions`는 배열의 배열 — 각 내부 배열이 하나의 메트릭 차원 조합
- 같은 메트릭에 여러 차원 조합 동시 게시
- 메트릭 이름과 동일한 키가 페이로드 최상위에 있어야 값으로 인식
- 추가 필드는 로그로 저장 (Insights 검색 가능)

### 5. Powertools for AWS Lambda

```python
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger(service="checkout")
tracer = Tracer()
metrics = Metrics(namespace="MyApp", service="checkout")

@logger.inject_lambda_context(correlation_id_path="requestContext.requestId")
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def handler(event, context):
    metrics.add_metric(name="OrderCount", unit=MetricUnit.Count, value=1)
    metrics.add_dimension(name="Region", value="ap-northeast-2")
    metrics.add_metadata(key="OrderId", value=event['order_id'])
    logger.info("Order received", extra={"order_id": event['order_id']})
    ...
```

자동 출력:
- 구조화 JSON 로그 + correlation id
- X-Ray 세그먼트 + 메타데이터
- EMF로 메트릭 + cold start 자동 메트릭

### 6. Cost vs Visibility 균형

| 데이터 | 비용 영향 | 가치 |
|--------|-----------|------|
| 모든 요청에 EMF metric | 메트릭 수 ↑ | 즉각 알람 |
| 모든 요청 X-Ray trace | 비용 ↑ | 디버깅 강력 |
| Sampled X-Ray (5%) | 절감 | 통계적 충분 |
| 5분 단위 비즈니스 메트릭 | 저렴 | 트렌드 추적 |

> 💡 시험 자주 묻는 패턴: "트래픽 폭증 + 비용 폭증 → 샘플링·집계"

### 7. High-Cardinality 함정

```json
"Dimensions": [["UserId"]]   // ⚠️ 사용자 수만큼 메트릭
```

수만 사용자 → 수만 개 메트릭 → 비용 폭증.

대안:
- Dimensions에는 카디널리티 낮은 것만 (Region, Service, Environment)
- UserId는 로그 필드로 → Insights에서 검색

---

## 🧠 알아두면 좋은 심화 이론

### EMF 멀티 차원 조합

```json
"Dimensions": [
  ["Service","Environment"],
  ["Service"],
  []
]
```

- `[Service, Environment]`: 둘 다로 분리된 메트릭
- `[Service]`: Service만으로 집계된 메트릭
- `[]`: 전체 합산 메트릭

세 가지 메트릭이 자동 게시됨 — 동일 데이터 다양 관점.

### Container Insights + Prometheus

EKS에서 Prometheus도 함께 운영하는 경우:
- ADOT Collector가 Prometheus scrape → CloudWatch 양쪽 전송
- AMP (Amazon Managed Prometheus) + AMG (Grafana) 조합

### Lambda Insights — Cold Start 분석

- Init duration 메트릭
- Provisioned Concurrency 효과 검증
- Cold/Warm 호출 비율

### EMF vs PutMetricData

| 항목 | EMF | PutMetricData |
|------|-----|--------------|
| API 호출 | 0 (로그만) | 메트릭당 |
| 비용 | 로그 ingestion | API 호출 + 메트릭 |
| 차원 | 다중 조합 가능 | 단일 |
| 워크플로 | 로그/메트릭 통합 | 분리 |
| 권장 | ✅ (Lambda/ECS) | EC2/외부 |

### 관련 서비스 Cross-Reference

- **X-Ray** → Week 11 Day 1
- **ADOT** → Week 11 Day 3
- **Synthetics / RUM** → Week 10 Day 4
- **OpenSearch / Prometheus** → Week 11 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
Container + Lambda Insights + EMF
==================================================

  ECS Cluster (Container Insights enabled)
   └─ awslogs driver → CWL
        └─ EMF in stdout → Metrics auto-extracted

  EKS Cluster
   ├─ Fluent Bit / ADOT → CWL
   └─ ADOT Collector → CloudWatch + Prometheus

  Lambda
   ├─ Lambda Insights Layer → /aws/lambda-insights/...
   └─ Powertools/EMF → /aws/lambda/<fn> log → auto metric

  CloudWatch
   ├─ Container Insights dashboard (auto)
   ├─ Lambda Insights dashboard (auto)
   └─ Metrics → Alarms → SNS/EventBridge
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Container Insights는 ECS/EKS Cluster 수준 활성
2. ⭐ Lambda Insights는 Layer + IAM 정책 필요
3. ⭐ EMF는 로그에 JSON 메트릭 임베드 → API 호출 없음
4. ⭐ Powertools가 EMF + 구조화 로그 + X-Ray 표준화
5. ⭐ High-Cardinality Dimension은 비용 폭탄 — UserId는 로그 필드로

---

## 💻 실제 예시 - Powertools Lambda

```python
from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger(service="checkout")
metrics = Metrics(namespace="MyApp/Orders", service="checkout")

@logger.inject_lambda_context(correlation_id_path="headers.X-Request-Id")
@metrics.log_metrics(capture_cold_start_metric=True)
def handler(event, context):
    order_id = event['order_id']
    try:
        process_order(order_id)
        metrics.add_metric(name="OrderCount", unit=MetricUnit.Count, value=1)
        metrics.add_dimension(name="Region", value=context.invoked_function_arn.split(":")[3])
        logger.info("Order processed", extra={"order_id": order_id})
    except Exception as e:
        metrics.add_metric(name="OrderFailed", unit=MetricUnit.Count, value=1)
        logger.exception("Order failed", extra={"order_id": order_id})
        raise
    return {"statusCode": 200}
```

---

## 📝 연습 문제

**문제 1.** Lambda에 사용자 정의 메트릭을 가장 효율적으로 게시하려면?
A) PutMetricData 매 호출
B) EMF (로그에 JSON, API 호출 0)
C) X-Ray
D) Container Insights

**정답: B**

**문제 2.** Container Insights 활성화 위치는?
A) Task Definition
B) ECS Cluster Settings
C) ECS Service
D) IAM Role

**정답: B**

**문제 3.** Lambda Insights 활성화에 필수가 아닌 것은?
A) Lambda Layer 추가
B) IAM 정책 (CloudWatchLambdaInsightsExecutionRolePolicy)
C) EC2 인스턴스
D) (없음 — A·B만 필수)

**정답: C**
해설: EC2 무관.

**문제 4.** EMF의 가장 큰 이점은?
A) X-Ray 통합
B) PutMetricData API 호출 없이 로그+메트릭 동시 + 다중 차원 조합
C) IAM 단순화
D) Region 자동

**정답: B**

**문제 5.** UserId를 EMF 차원으로 두는 위험은?
A) 차원 카디널리티 폭발 → 메트릭 비용 폭증
B) 정상
C) 보안 위반
D) IAM 부담

**정답: A**

**문제 6.** Cold start 분석에 가장 적합한 도구는?
A) Lambda Insights (init duration 메트릭)
B) Container Insights
C) Synthetics
D) CloudTrail

**정답: A**

**문제 7.** Powertools가 자동 제공하는 것이 아닌 것은?
A) 구조화 JSON 로그 + correlation id
B) X-Ray 세그먼트
C) EMF 메트릭 + cold start 메트릭
D) IAM Role 생성

**정답: D**

---

## 📌 오늘의 요약

1. Container Insights = ECS/EKS Cluster 수준
2. Lambda Insights = Layer + IAM
3. EMF = 로그+메트릭 통합 + 다중 차원 조합 + API 0 비용
4. Powertools가 EMF + 구조화 로그 + X-Ray 표준화
5. High-Cardinality Dimension 비용 폭탄 주의
