# Day 4 - Metric Filter, Embedded Metric Format, Anomaly Detection

📅 날짜: Week 2 (Day 4)
🎯 주제: 로그에서 메트릭을 추출하고 ML로 이상 감지
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Metric Filter로 로그 패턴을 Custom Metric으로 변환하는 방법을 안다
- Embedded Metric Format(EMF)로 한 번에 로그+메트릭을 푸시하는 패턴을 익힌다
- Anomaly Detection으로 임계값 없이도 이상을 잡는 방법을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **Time-series anomaly detection**: 정상 범위를 통계/ML로 학습해 벗어남을 감지. STL, ARIMA, LSTM 등
- **Cardinality 제어**: 메트릭 Dimension 수가 적을수록 비용 효율
- **Structured logging**: JSON 등으로 로그를 구조화 → 자동 파싱·검색
- **Cold path vs Hot path**: hot은 알람·실시간, cold는 분석·감사. 두 경로 분리 설계
- **Sampling**: 모든 데이터가 아닌 일부만 측정. 비용 절감 + 통계적 대표성

---

## 📖 이론 내용

### 1. Metric Filter - 로그를 메트릭으로

#### 동작 원리
```
Log Group의 로그
    │
    ▼ 패턴 매칭 (Filter Pattern)
    │
    ▼ 매칭된 이벤트에서 값 추출
    │
    ▼
CloudWatch Custom Metric 자동 푸시
```

#### 사용 사례
- 애플리케이션 로그의 ERROR 카운트 → 메트릭 → 알람
- API Gateway 5xx 발생 추출
- 로그인 실패 횟수 추적

#### Filter Pattern 문법

**텍스트 매칭:**
```
ERROR                    ← "ERROR" 포함 라인
"Database connection"    ← 정확한 구문
?ERROR ?FATAL            ← OR (둘 중 하나)
```

**JSON 매칭:**
```
{ $.level = "ERROR" }
{ $.duration > 1000 }
{ $.level = "ERROR" && $.user.id = "u123" }
```

**스페이스 구분 로그:**
```
[time, requestid, level=ERROR, ...]
[time, requestid, level=ERROR, message]
```

#### Metric Filter 생성 예시

```bash
aws logs put-metric-filter \
  --log-group-name /aws/lambda/order-service \
  --filter-name "error-count" \
  --filter-pattern "ERROR" \
  --metric-transformations \
      metricName=OrderServiceErrors,metricNamespace=MyApp/Orders,metricValue=1,defaultValue=0
```

- `metricValue=1`: 매칭마다 1씩 카운트 → 합계가 곧 ERROR 수
- `metricValue=$.duration`: JSON에서 필드 값을 메트릭 값으로
- `defaultValue=0`: 매칭 안 된 기간에도 0으로 발행 → 그래프 연속성

### 2. Embedded Metric Format (EMF)

#### 왜 필요한가
- Metric Filter는 로그를 한 번 더 스캔 → 처리 지연
- Custom PutMetricData는 API 호출 별도 필요 → 비용·복잡도
- **EMF**: 로그에 특정 JSON 구조로 출력하면 CloudWatch가 **자동으로 메트릭 추출**

#### EMF JSON 구조
```json
{
  "_aws": {
    "Timestamp": 1748000000000,
    "CloudWatchMetrics": [
      {
        "Namespace": "MyApp/Web",
        "Dimensions": [["Service", "Environment"]],
        "Metrics": [
          { "Name": "OrderCount", "Unit": "Count" },
          { "Name": "ResponseTime", "Unit": "Milliseconds" }
        ]
      }
    ]
  },
  "Service": "checkout",
  "Environment": "prod",
  "OrderCount": 1,
  "ResponseTime": 234,
  "user_id": "u123",
  "trace_id": "abc-def-123"
}
```

- `_aws.CloudWatchMetrics`가 메트릭 정의
- 같은 JSON의 다른 필드는 로그로만 저장 (메트릭 X)
- 메트릭 + 풍부한 로그 컨텍스트를 **한 번의 stdout으로** 발행

#### EMF 장점
1. **레이턴시 ↓**: Metric Filter보다 빠름
2. **비용 ↓**: PutMetricData API 호출 없음
3. **컨텍스트 풍부**: user_id, trace_id 같은 고카디널리티 데이터는 로그에만 (메트릭에는 X)
4. **언어별 라이브러리**: AWS Powertools (Python/Node/Java)

#### EMF + AWS Powertools 예시 (Python)
```python
from aws_lambda_powertools import Metrics
from aws_lambda_powertools.metrics import MetricUnit

metrics = Metrics(namespace="MyApp/Orders", service="checkout")

@metrics.log_metrics
def lambda_handler(event, context):
    metrics.add_metric(name="OrderCount", unit=MetricUnit.Count, value=1)
    metrics.add_metric(name="OrderAmount", unit=MetricUnit.None, value=event["amount"])
    return {"status": "ok"}
```

### 3. CloudWatch Anomaly Detection

#### 개념
- 메트릭의 정상 범위(밴드)를 ML로 학습 (최소 2주 데이터)
- 신호가 밴드 밖으로 벗어나면 알람 발생
- 요일·시간대 패턴 자동 학습 (출퇴근 트래픽 차이 등)

#### 활용 시나리오
- "정상 임계값을 모르겠다" → 학습으로 자동 결정
- 트래픽 패턴이 시간대별로 변동 (낮 vs 새벽)
- 비즈니스 메트릭 (주문 수, 매출 등)

#### 알람 설정
```bash
aws cloudwatch put-anomaly-detector \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-abc \
  --stat Average

aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-CPU-Anomaly" \
  --metrics '[
    {
      "Id": "m1",
      "MetricStat": {
        "Metric": { "Namespace": "AWS/EC2", "MetricName": "CPUUtilization", "Dimensions": [{"Name":"InstanceId","Value":"i-abc"}] },
        "Period": 300,
        "Stat": "Average"
      }
    },
    {
      "Id": "ad1",
      "Expression": "ANOMALY_DETECTION_BAND(m1, 2)",
      "Label": "CPU Expected Range"
    }
  ]' \
  --threshold-metric-id ad1 \
  --comparison-operator LessThanLowerOrGreaterThanUpperThreshold \
  --evaluation-periods 2
```

- `ANOMALY_DETECTION_BAND(m1, 2)`: 표준편차 2배 범위
- `LessThanLowerOrGreaterThanUpperThreshold`: 위/아래 모두 알람
- 처음 2주는 학습 기간 → 알람 동작 안 함

#### 비용
- 메트릭당 추가 $0.30/월 (anomaly detection 자체)
- 학습 데이터 별도 비용 없음

### 4. 모니터링 패턴 비교

| 패턴 | 장점 | 단점 | 사용 사례 |
|------|------|------|-----------|
| **Metric Filter** | 기존 로그 그대로 활용 | 지연 ~30초, 메트릭당 청구 | 레거시 앱 |
| **EMF** | 빠름, 효율적 | JSON 구조화 필요 | 신규/Lambda |
| **PutMetricData** | 유연 | API 호출 비용·복잡도 | 외부 시스템 |
| **Anomaly Detection** | 임계값 자동 | 학습 2주 + 비용 | 변동성 큰 메트릭 |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Contributor Insights** | 로그/메트릭의 Top N 기여자 자동 추출 | DDoS 공격자 IP, 에러 유발 함수 |
| **Logs Anomaly Detection** | 로그 패턴 자체에 ML 적용 | 신규 에러 자동 발견 |
| **Cross-Account Metric Streams** | 메트릭을 Firehose로 실시간 외부 전송 | DataDog/Splunk 통합 |
| **Composite Alarm** | 여러 알람 조합 (Day 3 Week 3) | 노이즈 감소 |

> ⚠️ **함정 1**: Metric Filter는 **이후 발생하는** 로그에만 적용 — 과거 로그는 메트릭으로 변환 안 됨.
>
> ⚠️ **함정 2**: Anomaly Detection은 최소 2주 학습 필요. 신규 메트릭에 즉시 적용 X.
>
> 💡 **암기 팁**: 신규 시스템엔 **EMF** 우선, 레거시엔 **Metric Filter**, 임계값 불명확하면 **Anomaly Detection**.

### 관련 서비스 Cross-Reference

- **Metric Filter → Week 3 Day 1** (알람 트리거로 사용)
- **EMF → Week 7** (Lambda 운영에서 표준 패턴)
- **Anomaly Detection → Week 11** (비용 메트릭에도 적용 가능)
- **Contributor Insights → Week 8** (VPC Flow Logs Top Talker 분석)

---

## 🏗️ 아키텍처 다이어그램

```
3가지 메트릭 발행 패턴 비교
=================================================

  ① Metric Filter (사후 추출)
     로그 생성 → CloudWatch Logs → Filter 매칭 → Custom Metric

  ② EMF (한 번에 발행)
     앱 stdout: EMF JSON → CloudWatch Logs (저장)
                                ↓ (자동 파싱)
                             Custom Metric

  ③ PutMetricData (직접 발행)
     앱 → CloudWatch API → Custom Metric
       (로그는 별도)

  ④ Anomaly Detection (ML 학습)
     기존 메트릭 → 2주 학습 → 정상 밴드 자동 산출
                              → Alarm: 밴드 벗어나면 알림
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Metric Filter는 이후 발생 로그만 적용** — 과거 로그는 변환 X
2. ⭐ **EMF는 stdout JSON 한 번으로 로그+메트릭** — Lambda 표준 패턴
3. ⭐ **Anomaly Detection은 2주 학습 후 동작** — 신규 메트릭 즉시 X
4. ⭐ **Custom Metric은 Dimension 카디널리티 주의** — user_id는 절대 X
5. ⭐ **Contributor Insights**로 Top N 추출 (DDoS 공격자, 느린 API 등)

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Metric Filter 생성 (ERROR 카운트)
aws logs put-metric-filter \
  --log-group-name /aws/lambda/order-service \
  --filter-name "error-count" \
  --filter-pattern '?ERROR ?FATAL' \
  --metric-transformations \
      'metricName=ErrorCount,metricNamespace=MyApp/Lambda,metricValue=1,defaultValue=0,unit=Count,dimensions={FunctionName=$.functionName}'

# 2. JSON 로그에서 응답 시간 추출 (Metric Filter)
aws logs put-metric-filter \
  --log-group-name /myapp/web \
  --filter-name "response-time" \
  --filter-pattern '{ $.duration_ms > 0 }' \
  --metric-transformations \
      'metricName=ResponseTime,metricNamespace=MyApp/Web,metricValue=$.duration_ms,unit=Milliseconds'

# 3. EMF 로그 직접 생성 (Lambda 외부 테스트)
cat <<'EOF' | aws logs put-log-events \
    --log-group-name /myapp/web \
    --log-stream-name test \
    --log-events file:///dev/stdin
[{
  "timestamp": 1748000000000,
  "message": "{\"_aws\":{\"Timestamp\":1748000000000,\"CloudWatchMetrics\":[{\"Namespace\":\"MyApp\",\"Dimensions\":[[\"Service\"]],\"Metrics\":[{\"Name\":\"RequestCount\",\"Unit\":\"Count\"}]}]},\"Service\":\"web\",\"RequestCount\":1,\"user_id\":\"u123\"}"
}]
EOF

# 4. Anomaly Detector 생성
aws cloudwatch put-anomaly-detector \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=order-service \
  --stat Sum

# 5. Anomaly 알람 생성
aws cloudwatch put-metric-alarm \
  --alarm-name "Order-Lambda-Invocation-Anomaly" \
  --metrics '[
    {
      "Id": "m1",
      "MetricStat": {
        "Metric": {
          "Namespace": "AWS/Lambda",
          "MetricName": "Invocations",
          "Dimensions": [{"Name":"FunctionName","Value":"order-service"}]
        },
        "Period": 300,
        "Stat": "Sum"
      }
    },
    {
      "Id": "ad1",
      "Expression": "ANOMALY_DETECTION_BAND(m1, 2)"
    }
  ]' \
  --threshold-metric-id ad1 \
  --comparison-operator LessThanLowerOrGreaterThanUpperThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:ap-northeast-2:123456789012:ops-alerts
```

---

## 📝 연습 문제

**문제 1.** 한 회사가 Lambda 함수에서 발생하는 ERROR 로그 횟수를 추적해 알람을 보내려 한다. 가장 효율적인 방법은?

A) Logs Insights를 주기 실행
B) Metric Filter로 ERROR 패턴 → Custom Metric → Alarm
C) Subscription Filter로 Slack 직접 알림
D) S3 export 후 Athena

**정답: B**
해설: 표준 패턴. Metric Filter가 자동으로 카운트 메트릭 발행 → Alarm이 threshold 초과 시 SNS. Subscription Filter+Slack은 모든 ERROR마다 알림이라 노이즈, 일시 폭증 시 부적합.

---

**문제 2.** EMF의 장점이 아닌 것은?

A) PutMetricData 별도 호출 불필요
B) 로그와 메트릭을 한 번에 발행
C) 메트릭 보존 기간이 영구
D) 고카디널리티 컨텍스트(user_id 등)는 로그에만 저장

**정답: C**
해설: EMF로 발행한 메트릭도 일반 메트릭과 같이 **15개월 보존**. 다른 옵션은 모두 EMF 장점.

---

**문제 3.** 한 회사의 주문 수 메트릭이 시간대별로 5배까지 변동한다. 고정 threshold로 알람을 만들면 노이즈가 많다. 해결책은?

A) 알람을 끈다
B) Composite Alarm 사용
C) Anomaly Detection 알람으로 변경
D) Period를 늘린다

**정답: C**
해설: 시간대별 패턴이 있는 메트릭은 Anomaly Detection이 적합. 요일/시간대 정상 범위를 ML로 학습해 자동 밴드 생성. 단, 2주 학습 기간 필요.

---

**문제 4.** Metric Filter를 막 생성했는데 과거 로그의 ERROR 수가 메트릭으로 안 나타난다. 이유는?

A) IAM 권한 부족
B) Metric Filter는 생성 이후 발생하는 로그에만 적용
C) Log Group 권한
D) KMS 암호화

**정답: B**
해설: Metric Filter는 forward-only. 과거 로그를 메트릭으로 변환하려면 Logs Insights로 집계 또는 S3 export 후 별도 처리.

---

**문제 5.** EMF로 메트릭을 발행하는 코드에서 `user_id`를 어떻게 다뤄야 하나?

A) Dimension에 추가
B) Metric Name에 포함
C) JSON 일반 필드로 두고 (메트릭으로 정의 X), 로그 검색에만 사용
D) PutMetricData로 별도 발행

**정답: C**
해설: user_id처럼 고카디널리티 값은 **메트릭 Dimension에 절대 X** (비용 폭발). EMF 장점은 같은 JSON에 메트릭 외 필드를 두어 **로그로만** 검색·필터 가능.

---

## 📌 오늘의 요약

1. Metric Filter: 로그 패턴 → Custom Metric. 사후 발생 로그만 적용
2. EMF (Embedded Metric Format): stdout JSON 하나로 로그+메트릭 동시 발행. Lambda 표준
3. Anomaly Detection: ML로 정상 밴드 학습 → 변동성 큰 메트릭에 적합. 2주 학습 기간 필요
4. 메트릭 Dimension에 user_id 같은 고카디널리티 값 절대 금지
5. Contributor Insights로 Top N 추출 — DDoS 공격자, 에러 유발 함수 분석에 활용
