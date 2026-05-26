# Day 9 - Metric Filter, EMF 심화, Anomaly Detection: 메트릭과 로그의 다리

운영자가 매일 만나는 의사결정 중 하나는 "이 정보를 메트릭으로 발행할까, 로그로 남길까". 둘은 동전의 양면이다. 메트릭은 시계열 + 통계로 빠르게 알람 가능, 로그는 원본 상세로 디버깅 가능. 오늘은 이 둘을 잇는 세 도구 — **Metric Filter, EMF, Anomaly Detection** — 을 깊이 본다.

## Metric Filter: 로그를 메트릭으로 변환

Metric Filter는 Log Group의 로그 패턴을 매치해 CloudWatch 메트릭으로 변환한다. 예: ALB 액세스 로그에서 5xx 응답을 카운트해 메트릭으로 발행.

```
[Log Group: /aws/elb/access]
   "GET /api 500 ..."
   "POST /order 201 ..."
   "GET /user 503 ..."
        │
        │ Metric Filter Pattern: [request, status=5*, ...]
        ▼
[CloudWatch Metric: MyApp/5xxCount = 2]
```

### Filter 패턴 문법

```
# 1) Simple word
"ERROR"               ← "ERROR" 포함 매치

# 2) Multiple words
"ERROR" "Database"    ← 둘 다 포함

# 3) Term exclusion
"ERROR" -"timeout"    ← ERROR 포함, timeout 미포함

# 4) Field-based (space-delimited)
[ip, user, ..., status=5*, size, ...]    ← 5xx만

# 5) JSON-based
{ $.level = "ERROR" && $.statusCode >= 500 }

# 6) Numeric
{ $.duration > 1000 }
```

### Metric Filter 활용 패턴

```yaml
# CloudFormation 예
MyErrorFilter:
  Type: AWS::Logs::MetricFilter
  Properties:
    LogGroupName: /aws/lambda/myfn
    FilterPattern: "?ERROR ?CRITICAL ?Exception"
    MetricTransformations:
      - MetricName: ErrorCount
        MetricNamespace: MyApp/Lambda
        MetricValue: 1
        DefaultValue: 0
        Dimensions:
          FunctionName: !Ref MyFunction
```

`DefaultValue: 0`이 중요. 매치 없을 때 0을 발행해야 "데이터 없음" 상태와 "0개 에러" 상태가 구별된다.

> ⚠️ **함정**: `DefaultValue`를 안 넣으면 매치가 없을 때 메트릭이 발행 안 됨. 알람의 `TreatMissingData` 처리에 따라 false negative 발생 가능. 시험에서 "Metric Filter로 만든 메트릭이 알람을 안 울린다" 시나리오는 보통 이 함정.

> 🔍 **더 깊이**: Metric Filter는 **로그 ingestion 시점에 평가**된다. 즉 새 로그가 도착할 때만 메트릭 발행. 과거 로그를 retroactive로 다시 평가하지 않음. 그래서 운영자가 새 Filter를 만들어도 과거 로그는 메트릭화되지 않고, 그 시점부터의 신규 로그만 카운트.

## EMF의 깊이: 운영자가 알아야 할 사실

어제 본 EMF는 메트릭 + 로그 통합. 오늘은 깊이.

### EMF JSON 스펙

```json
{
  "_aws": {
    "Timestamp": 1716700000000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp",
      "Dimensions": [
        ["Service"],
        ["Service", "Operation"]
      ],
      "Metrics": [
        {"Name": "Latency", "Unit": "Milliseconds"},
        {"Name": "ErrorCount", "Unit": "Count"}
      ]
    }]
  },
  "Service": "checkout",
  "Operation": "PlaceOrder",
  "Latency": 234,
  "ErrorCount": 0,
  "RequestId": "abc-123",
  "UserId": "u-999"
}
```

핵심:
- **`Dimensions` 배열의 각 원소가 별도 dimension 조합**. 위 예는 `(Service)` 1개와 `(Service, Operation)` 2개 — 두 개의 별도 메트릭 발행.
- **EMF JSON의 모든 필드가 로그에 저장**되지만, `CloudWatchMetrics`에 선언된 것만 메트릭이 됨.
- **카디널리티 높은 필드(RequestId, UserId)는 로그 필드로만, dimension에 안 넣음**.

### EMF의 PowerTools 라이브러리

```python
# AWS Lambda Powertools (Python)
from aws_lambda_powertools import Metrics
from aws_lambda_powertools.metrics import MetricUnit

metrics = Metrics(namespace="MyApp", service="checkout")

@metrics.log_metrics  # 자동으로 함수 끝에 EMF 출력
def lambda_handler(event, context):
    metrics.add_metric(name="ItemsProcessed", 
                       unit=MetricUnit.Count, value=10)
    metrics.add_metric(name="Latency", 
                       unit=MetricUnit.Milliseconds, value=234)
    metrics.add_dimension(name="Operation", value="PlaceOrder")
    # 로그 필드 추가 (메트릭은 아님)
    metrics.add_metadata(key="user_id", value="u-999")
```

이 코드 한 번이면 EMF JSON이 stdout으로 출력되고, Lambda가 CloudWatch Logs로 전달, 메트릭으로 자동 추출.

> 📚 **사례**: 한 금융 회사가 모든 트랜잭션마다 5개 메트릭(latency, amount, error_count, retry_count, db_calls)을 PutMetricData로 발행. 월 API 호출 100억 회 → 비용 $100,000. EMF로 전환 후 API 비용 zero, 로그 비용은 약간 증가했지만 90% 절감. EMF가 "운영자 비용 절감 1순위"인 이유.

> 💡 **관련 이론**: EMF는 OpenTelemetry의 metrics + logs 통합 모델과 같은 철학. 단일 텔레메트리 이벤트에서 메트릭·로그·트레이스를 모두 추출. 분산 시스템 관찰성의 표준 방향(2020년대 OTel 표준화).

## Anomaly Detection: ML 기반 동적 베이스라인

고정 임계값(예: CPU > 80%) 알람의 단점: 시간대·요일별로 정상 패턴이 다른 워크로드에서 false positive 폭증. **Anomaly Detection**은 최근 2주의 패턴을 ML로 학습해 동적 베이스라인 생성.

### 작동 원리

```
[CPU 메트릭, 지난 14일]
    │
    │ STL/ARIMA 회귀 학습
    ▼
[모델: 요일별 + 시간대별 평균 + 표준편차]
    │
    │ 매시간 재학습
    ▼
[Anomaly Band: 평균 ± n × stddev]
```

알람 설정 시 표준편차 배수(n)만 지정. 보통 2~3.

> 💡 **관련 이론**: STL(Seasonal-Trend Decomposition using LOESS)은 시계열을 trend + seasonal + residual로 분해. Cleveland et al.(1990, Journal of Official Statistics)에서 발표. ARIMA(AutoRegressive Integrated Moving Average)는 더 일반적인 시계열 모델로 Box-Jenkins 방법론(1970). Facebook Prophet, Twitter AnomalyDetection, AWS Forecast 모두 같은 계열. 운영자가 직접 임계값 튜닝하는 부담을 ML이 대체.

### 운영자 적용 시나리오

| 시나리오 | Anomaly Detection 효과 |
|----------|------------------------|
| 매일 같은 시간 트래픽 피크 | 평소 피크는 알람 안 울리고 비정상 시점만 |
| 주말 트래픽 패턴이 다른 서비스 | 요일별 학습으로 정확한 베이스라인 |
| 점진적 증가 추세 | trend 학습으로 절대값 알람 대체 |
| 첫 출시 직후 (학습 데이터 부족) | 부적합 (최소 2일 데이터 필요) |

> 📚 **사례**: 한 e-commerce 회사가 매일 점심·저녁 트래픽 피크 + 주말 평일 다른 패턴. 고정 임계값으로 알람 만들 때 매일 false positive 30건. Anomaly Detection 도입 후 false positive 90% 감소. 운영자 야간 호출 대폭 감소.

### Math Expression과 Anomaly Detection 결합

```
m1 = ErrorCount (sum, 1분)
m2 = RequestCount (sum, 1분)
e1 = m1 / m2 * 100         # 에러율
e2 = ANOMALY_DETECTION_BAND(e1, 2)  # ML 베이스라인
```

알람: e1이 e2의 upper band를 넘으면 알람.

> ⚠️ **함정**: Anomaly Detection은 최소 2일치 데이터가 필요. 새로 만든 메트릭에 바로 적용하면 학습 부족으로 거의 모든 데이터 포인트가 anomaly. 시험에서 "신규 서비스에 즉시 anomaly detection 적용 → 잘못된 알람" 시나리오의 답은 "데이터 누적 후 적용".

## Logs Anomaly Detection (2023 출시)

메트릭의 Anomaly Detection과 비슷하게 **로그 패턴 자체**의 이상을 ML로 탐지. 처음 보는 패턴, 빈도가 갑자기 변한 패턴을 자동 알림.

```
[정상 학습된 패턴]
"INFO Started processing order=*"
"INFO Order * completed in *ms"
"WARN Retry attempt * for order *"

[이상 탐지]
"FATAL Database connection lost"  ← 처음 보는 패턴, 알람
"INFO Started processing order=*" (빈도 평소의 10배) ← 비정상 빈도, 알람
```

운영자가 수동 Metric Filter 안 만들어도 ML이 자동 처리.

## Cross-Account Metric/Log View

여러 계정의 메트릭과 로그를 한 콘솔에서 보려면 **CloudWatch Observability Access Manager** (2022 출시).

```
[Monitoring Account] ← 운영팀이 보는 계정
   │ Sink 활성화
   │
   ├── Source Account A의 메트릭·로그 자동 동기화
   ├── Source Account B의 메트릭·로그 자동 동기화
   └── Source Account C의 메트릭·로그 자동 동기화
```

운영자 패턴: 별도 모니터링 계정을 만들고 모든 워크로드 계정의 sink를 연결. 운영자는 한 콘솔에서 전 계정 메트릭/로그/X-Ray trace 통합 조회.

## 정리하며

오늘의 흐름:
- **Metric Filter**: 로그 → 메트릭 (기존 로그를 카운트 메트릭으로)
- **EMF**: 한 줄 로그에 메트릭 임베드 (가장 비용 효율적)
- **Anomaly Detection**: ML 기반 동적 임계값 (false positive 감소)

운영자는 신규 워크로드 시작 시:
1. EMF로 애플리케이션 메트릭 발행
2. AWS 표준 메트릭은 그대로
3. 핵심 메트릭에 Anomaly Detection 알람
4. 기타 메트릭에 고정 임계값 알람
5. 모든 Log Group에 보존 정책

내일은 Week 2 복습 + 시나리오 10문제.

---

## 📝 연습 문제

**문제 1.** Metric Filter를 만들었는데 매치가 없을 때 메트릭이 발행되지 않아 알람이 안 울린다. 원인과 해결은?

A) Filter 패턴이 잘못됨
B) `DefaultValue: 0`을 설정해 매치 없을 때 0을 발행하게
C) Log Group 보존 부족
D) Alarm Evaluation Period 부족

**정답: B**
해설: Metric Filter는 매치 시에만 메트릭 발행. 매치 없으면 메트릭 데이터 없음 → 알람의 TreatMissingData에 따라 처리. DefaultValue: 0을 설정하면 매치 없을 때도 0이 발행돼 "0건 에러" 상태가 명확.

---

**문제 2.** Anomaly Detection을 신규 메트릭에 즉시 적용하니 모든 데이터가 anomaly로 표시. 원인은?

A) Anomaly Detection은 최소 2주 학습 데이터 필요
B) 메트릭의 dimension이 잘못됨
C) Alarm Evaluation Period 부족
D) High-Resolution이 아니라서

**정답: A**
해설: Anomaly Detection은 최근 2주 데이터로 학습. 신규 메트릭은 학습 데이터가 없거나 부족해 거의 모든 값이 anomaly. 운영자는 2-14일 데이터 누적 후 활성화.

---

**문제 3.** 운영자가 매일 같은 시간 트래픽 피크가 있는 워크로드에서 false positive를 줄이려면?

A) 고정 임계값을 평균 + 표준편차로 설정
B) Anomaly Detection 기반 알람
C) Composite Alarm
D) Math Expression

**정답: B**
해설: Anomaly Detection은 시간대·요일별 패턴을 학습. 평소 피크는 정상으로 처리, 진짜 이상만 탐지.

---

**문제 4.** 운영자가 모든 트랜잭션마다 메트릭 5개를 발행해 API 비용이 폭증. 가장 적합한 대안은?

A) 배치 발행
B) EMF로 한 줄 로그에 메트릭 임베드
C) Custom Logs Insights
D) Metric Filter

**정답: B**
해설: EMF는 console.log 한 줄로 메트릭 자동 추출. API 호출 비용 zero.

---

**문제 5.** 여러 계정의 메트릭과 로그를 한 콘솔에서 보려면?

A) 각 계정 콘솔에 일일이 로그인
B) CloudWatch Cross-Account Observability + Sink 활성화
C) S3로 export 후 Athena
D) 모든 계정의 IAM Role을 통합

**정답: B**
해설: CloudWatch Observability Access Manager로 monitoring account에 sink, 각 워크로드 계정에서 source 연결. 한 콘솔에서 전 계정 메트릭/로그/X-Ray trace 통합.
