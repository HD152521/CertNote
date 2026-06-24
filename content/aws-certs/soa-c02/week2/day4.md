# Day 4 - Metric Filter, EMF 심화, Anomaly Detection: 메트릭과 로그를 잇는 세 다리

운영자가 매일 만나는 의사결정 중 하나는 "이 정보를 메트릭으로 발행할까, 로그로 남길까". 둘은 동전의 양면이다. 메트릭은 시계열 + 통계로 빠르게 알람·자동 스케일링이 가능하고, 로그는 원본 상세로 디버깅이 가능하다. 메트릭은 분 단위·달러 단위로 비싸고, 로그는 카디널리티에 자유롭지만 검색이 느리다. 두 세계를 잇는 다리가 세 개 있다 — **Metric Filter, EMF, Anomaly Detection**. 오늘은 이 세 도구의 내부 구조를 파고든다.

세 도구를 적재적소에 쓰면 다음이 가능해진다. 코드 수정 없이 기존 로그를 메트릭으로 변환(Metric Filter), 코드 한 줄로 메트릭·로그·trace 통합(EMF), 사람 손 없이 시간대별 정상 패턴 학습 후 이상만 알림(Anomaly Detection). 시험에서 이 세 가지를 시나리오로 헷갈리게 묻는 문제가 자주 나온다.

## Metric Filter: 로그를 메트릭으로 변환

Metric Filter는 Log Group의 로그 패턴을 매치해 CloudWatch 메트릭으로 변환한다. 예: ALB 액세스 로그에서 5xx 응답을 카운트해 메트릭으로 발행, syslog에서 OOM 이벤트를 카운트.

```
[Log Group: /aws/elb/access]
   "GET /api 500 ..."
   "POST /order 201 ..."
   "GET /user 503 ..."
        │
        │ Metric Filter Pattern: [request, status=5*, ...]
        ▼
[CloudWatch Metric: MyApp/5xxCount = 2]
   (이 1분 윈도우에 매치 2건)
```

### Filter 패턴 문법

```
# 1) Simple word
"ERROR"               ← "ERROR" 포함 매치

# 2) Multiple words (AND)
"ERROR" "Database"    ← 둘 다 포함

# 3) OR pattern (?)
?ERROR ?CRITICAL ?Exception   ← 셋 중 하나

# 4) Term exclusion
"ERROR" -"timeout"    ← ERROR 포함, timeout 미포함

# 5) Field-based (space-delimited 텍스트 로그)
[ip, user, ..., status=5*, size, ...]    ← 5xx만

# 6) JSON-based
{ $.level = "ERROR" && $.statusCode >= 500 }

# 7) Numeric comparison
{ $.duration > 1000 }
{ $.errorRate >= 0.05 }
```

### Metric Filter 활용 패턴 (CloudFormation)

```yaml
MyErrorFilter:
  Type: AWS::Logs::MetricFilter
  Properties:
    LogGroupName: /aws/lambda/myfn
    FilterPattern: "?ERROR ?CRITICAL ?Exception ?FATAL"
    MetricTransformations:
      - MetricName: ErrorCount
        MetricNamespace: MyApp/Lambda
        MetricValue: "1"
        DefaultValue: 0         # ★ 매치 없을 때도 0 발행
        Dimensions:
          - Key: FunctionName
            Value: $.functionName
          - Key: Env
            Value: $.env
        Unit: Count
```

`DefaultValue: 0`이 중요. 매치가 없을 때 0을 발행해야 "데이터 없음"과 "0건 발생"이 구별되며, 알람의 `TreatMissingData` 처리에서 false negative를 피한다.

> ⚠️ **함정**: `DefaultValue`를 안 넣으면 매치가 없을 때 메트릭이 발행 안 됨. 알람의 `TreatMissingData=notBreaching`(기본)이면 데이터 없음 = 정상으로 처리해 false negative 발생. 시험에서 "Metric Filter로 만든 메트릭이 알람을 안 울린다" 또는 "TreatMissingData 영향" 시나리오는 거의 항상 이 함정.

> 🔍 **더 깊이**: Metric Filter는 **로그 ingestion 시점에 평가**된다(stream에 들어올 때). 즉 새 로그가 도착할 때만 메트릭 발행. **과거 로그를 retroactive로 다시 평가하지 않음** — 새 Filter를 만든 시점부터의 신규 로그만 카운트. 운영자가 이 사실을 모르고 "어제 ERROR 로그가 많았는데 새로 Filter 만들었으니 어제 메트릭도 보이겠지" 했다가 빈 그래프를 보고 당황하는 일이 흔하다. 과거 로그를 메트릭화하려면 Insights로 별도 분석.

> 💡 **관련 이론**: Metric Filter는 **stream processing의 stateless transformation** 패턴. Apache Kafka Streams, Apache Flink, AWS Kinesis Data Analytics 모두 같은 패러다임. "in-flight" 데이터에만 적용 가능하고 historical batch는 별도 처리.

### Metric Filter의 한계와 대안

| 한계 | 대안 |
|------|------|
| 과거 로그 retroactive 처리 불가 | Logs Insights로 별도 집계 |
| 한 Log Group당 metric filter 100개 한도 | EMF 직접 발행 |
| 카디널리티 폭증 위험 (Dimension에 user_id 등) | EMF에서 메타데이터 필드로 |
| 평가 latency 분 단위 | Subscription Filter + Lambda → PutMetricData |

## EMF의 깊이: 운영자가 알아야 할 사실

어제 본 EMF는 메트릭 + 로그 통합의 표준. 오늘은 그 깊이.

### EMF JSON 스펙 상세

```json
{
  "_aws": {
    "Timestamp": 1716700000000,
    "CloudWatchMetrics": [
      {
        "Namespace": "MyApp",
        "Dimensions": [
          ["Service"],
          ["Service", "Operation"],
          ["Service", "Operation", "Env"]
        ],
        "Metrics": [
          {"Name": "Latency", "Unit": "Milliseconds", "StorageResolution": 60},
          {"Name": "ErrorCount", "Unit": "Count"},
          {"Name": "OrderValue", "Unit": "None"}
        ]
      }
    ]
  },
  "Service": "checkout",
  "Operation": "PlaceOrder",
  "Env": "prod",
  "Latency": 234,
  "ErrorCount": 0,
  "OrderValue": 49.99,
  "RequestId": "abc-123",
  "UserId": "u-999",
  "TraceId": "1-5759e988-bd862e3fe1be46a994272793"
}
```

핵심 4가지:

1. **`Dimensions` 배열의 각 원소가 별도 dimension 조합**. 위 예는 `(Service)` / `(Service, Operation)` / `(Service, Operation, Env)` — 세 개의 별도 메트릭 발행. 한 EMF JSON에서 여러 dimension 집합을 동시에 만들 수 있어 카디널리티 trade-off 조절 용이.
2. **EMF JSON의 모든 필드가 로그에 저장**되지만, `CloudWatchMetrics`에 선언된 것만 메트릭이 됨. 나머지는 로그 검색에만 사용.
3. **카디널리티 높은 필드(RequestId, UserId, TraceId)는 로그 필드로만, dimension에 안 넣음**. 메트릭 카디널리티 폭증 방지.
4. **메트릭당 `StorageResolution=1`로 1초 해상도 가능**.

### EMF의 PowerTools 라이브러리

```python
# AWS Lambda Powertools (Python)
from aws_lambda_powertools import Metrics, Logger, Tracer
from aws_lambda_powertools.metrics import MetricUnit

metrics = Metrics(namespace="MyApp", service="checkout")
logger = Logger(service="checkout")
tracer = Tracer(service="checkout")

@logger.inject_lambda_context
@tracer.capture_lambda_handler
@metrics.log_metrics  # 자동으로 함수 끝에 EMF JSON 출력
def lambda_handler(event, context):
    metrics.add_metric(name="ItemsProcessed",
                       unit=MetricUnit.Count, value=10)
    metrics.add_metric(name="Latency",
                       unit=MetricUnit.Milliseconds, value=234)
    metrics.add_dimension(name="Operation", value="PlaceOrder")
    metrics.add_dimension(name="Env", value="prod")
    # 로그 필드 추가 (메트릭은 아님, 카디널리티 회피)
    metrics.add_metadata(key="user_id", value="u-999")
    metrics.add_metadata(key="order_id", value="o-456")
    logger.info("Order processed", extra={"order_id": "o-456"})
```

이 코드 한 번이면 EMF JSON이 stdout으로 출력, Lambda가 CloudWatch Logs로 전달, 메트릭으로 자동 추출. 동시에 X-Ray trace까지 함께 작성된다.

```javascript
// AWS Lambda Powertools (TypeScript)
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';

const metrics = new Metrics({ namespace: 'MyApp', service: 'checkout' });

export const handler = async (event) => {
  metrics.addMetric('ItemsProcessed', MetricUnits.Count, 10);
  metrics.addMetric('Latency', MetricUnits.Milliseconds, 234);
  metrics.addDimension('Operation', 'PlaceOrder');
  metrics.addMetadata('user_id', 'u-999');
  metrics.publishStoredMetrics();
};
```

> 📚 **사례**: 한 금융 회사가 모든 트랜잭션마다 5개 메트릭(latency, amount, error_count, retry_count, db_calls)을 PutMetricData로 발행. 월 API 호출 100억 회 → API 비용 \$100,000. EMF로 전환 후 API 비용 zero, 로그 비용은 약간 증가했지만(20%) 전체적으로 90% 절감. EMF가 "운영자 비용 절감 1순위"인 이유.

> 💡 **관련 이론**: EMF는 OpenTelemetry(OTel)의 metrics + logs + traces 통합 모델과 같은 철학. 단일 텔레메트리 이벤트에서 메트릭·로그·트레이스를 모두 추출 가능. CNCF의 OpenTelemetry는 2019년 OpenTracing + OpenCensus 통합으로 시작해 2021년 GA, 2024년 현재 분산 시스템 관찰성의 사실상 표준. AWS는 EMF 외에 ADOT(AWS Distro for OpenTelemetry)로 OTel 표준을 직접 지원.

### EMF의 한계

| 한계 | 의미 |
|------|------|
| 메트릭 추출 latency 분 단위 | 즉각 알람 필요한 메트릭은 PutMetricData가 더 적합 |
| 로그 ingestion 비용 발생 | 메트릭 비용은 아끼지만 로그 비용은 늘어남 |
| Log Group이 있어야 함 | 로그 비활성화된 환경에선 사용 불가 |
| 메트릭 정확도가 로그 정확도에 의존 | 로그가 누락되면 메트릭도 누락 |

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
    │
    │ 메트릭이 band 밖으로 나가면 알람
    ▼
[Alarm Trigger]
```

알람 설정 시 표준편차 배수(n)만 지정. 보통 2(95% 신뢰구간) ~ 3(99.7% 신뢰구간). 메트릭의 노이즈 수준과 false positive 허용도에 따라 선택.

> 💡 **관련 이론**: STL(Seasonal-Trend Decomposition using LOESS)은 시계열을 trend(장기 추세) + seasonal(주기적 패턴) + residual(잔차)로 분해. Cleveland et al.(1990, *Journal of Official Statistics*)에서 발표. ARIMA(AutoRegressive Integrated Moving Average)는 더 일반적인 시계열 모델로 Box-Jenkins 방법론(1970, *Time Series Analysis*). Facebook Prophet(Taylor & Letham, 2017), Twitter AnomalyDetection(2015 GitHub), AWS Forecast 모두 같은 계열. 운영자가 직접 임계값 튜닝하는 부담을 ML이 대체.

### 운영자 적용 시나리오

| 시나리오 | Anomaly Detection 효과 | 적합도 |
|----------|------------------------|--------|
| 매일 같은 시간 트래픽 피크 | 평소 피크는 알람 안 울리고 비정상 시점만 | ★★★★★ |
| 주말 트래픽 패턴이 다른 서비스 | 요일별 학습으로 정확한 베이스라인 | ★★★★★ |
| 점진적 증가 추세(트래픽 성장) | trend 학습으로 절대값 임계값 대체 | ★★★★ |
| 갑작스러운 트래픽 변화가 잦음 | false positive 가능, 표준편차 배수 증가 | ★★ |
| 첫 출시 직후 (학습 데이터 부족) | 부적합 (최소 2일~2주 데이터 필요) | ★ |
| 24/7 균일 워크로드 | 고정 임계값으로 충분 | ★ |

> 📚 **사례**: 한 e-commerce 회사가 매일 점심 12시·저녁 7시 트래픽 피크 + 주말 평일 다른 패턴. 고정 임계값으로 알람 만들 때 매일 false positive 30건이 새벽 호출로 이어졌다. Anomaly Detection 도입 후 false positive 90% 감소. 운영자 야간 호출 대폭 감소.

### Math Expression과 Anomaly Detection 결합

```
m1 = ErrorCount (sum, 1분)
m2 = RequestCount (sum, 1분)
e1 = m1 / m2 * 100              # 에러율 (%)
e2 = ANOMALY_DETECTION_BAND(e1, 2)  # ML 베이스라인, 표준편차 ±2
```

알람 설정: `e1`이 `e2`의 upper band를 넘으면 알람. 일반 임계값 알람과 결합도 가능:

```
e1 > 5%  AND  e1 > e2.upper   # 5% 초과 + 평소보다도 비정상
```

이렇게 "절대값 + 상대값" 두 조건을 AND로 묶으면 트래픽 적은 시간대(평소 0%) false positive를 막을 수 있다.

> ⚠️ **함정**: Anomaly Detection은 **최소 2주치 데이터로 학습**. 신규 메트릭에 바로 적용하면 학습 부족으로 거의 모든 데이터 포인트가 anomaly. 시험에서 "신규 서비스에 즉시 anomaly detection 적용 → 잘못된 알람" 시나리오의 답은 "최소 2일~2주 데이터 누적 후 활성화". 학습 중에도 알람은 평가되지만 정확도가 낮다.

## Logs Anomaly Detection (2023 출시)

메트릭의 Anomaly Detection과 비슷하게 **로그 패턴 자체**의 이상을 ML로 탐지. 처음 보는 패턴, 빈도가 갑자기 변한 패턴을 자동 알림.

```
[정상 학습된 패턴]
"INFO Started processing order=*"
"INFO Order * completed in *ms"
"WARN Retry attempt * for order *"

[이상 탐지]
"FATAL Database connection lost"             ← 처음 보는 패턴, 알람
"INFO Started processing order=*" 빈도 평소의 10배 ← 비정상 빈도, 알람
"java.lang.OutOfMemoryError: Java heap space"  ← 새 예외 패턴, 알람
```

운영자가 수동 Metric Filter 안 만들어도 ML이 자동 처리. 메트릭 Anomaly와 마찬가지로 학습에 며칠~수 주가 필요. 활성화 후 안정적 베이스라인이 잡힐 때까지 false positive가 있을 수 있다.

> 🔍 **더 깊이**: Logs Anomaly Detection은 내부적으로 **log pattern clustering**(Drain 알고리즘 계열로 추정)으로 비슷한 로그를 하나의 패턴으로 묶은 후, 그 패턴의 빈도·timing의 이상을 STL/ARIMA로 탐지하는 2단 ML 파이프라인. 운영자가 직접 정규식·Metric Filter를 안 짜도 ML이 자동으로 "이 로그와 이 로그는 같은 종류"라고 묶어준다.

## Cross-Account Metric/Log View

여러 계정의 메트릭과 로그를 한 콘솔에서 보려면 **CloudWatch Observability Access Manager** (2022 출시).

```
[Monitoring Account] ← 운영팀이 보는 계정
   │ Sink 활성화
   │
   ├── Source Account A의 메트릭·로그·X-Ray 자동 동기화
   ├── Source Account B의 메트릭·로그·X-Ray 자동 동기화
   └── Source Account C의 메트릭·로그·X-Ray 자동 동기화
```

운영자 패턴: 별도 모니터링 계정을 만들고 모든 워크로드 계정의 sink를 연결. 운영자는 한 콘솔에서 전 계정 메트릭/로그/X-Ray trace 통합 조회. Organization 전체 자동 enrollment 옵션으로 새 계정도 자동 연결된다.

## 세 도구 비교: 언제 무엇을 쓸까

| 도구 | 사용 시점 | 비용 | 학습 필요 |
|------|-----------|------|-----------|
| **Metric Filter** | 코드 수정 불가, 기존 로그에서 메트릭 추출 | 메트릭당 \$0.30 | - |
| **EMF** | 신규 코드, 메트릭+로그+trace 통합 | API 비용 zero | - |
| **PutMetricData** | 즉각 메트릭 반응 필요 | 1,000건 \$0.01 | - |
| **Anomaly Detection (metric)** | 시간대 패턴 있는 메트릭 | 메트릭당 \$0.30 추가 | 2일~2주 |
| **Anomaly Detection (logs)** | 로그 패턴 자체 이상 탐지 | 분석 비용 | 수일~수 주 |

운영자의 의사결정 트리:

```
"이 정보를 어떻게 발행할까?"
   ├─ 새 코드 작성 가능? ──── YES ──→ EMF (메트릭+로그+trace 통합)
   │                       
   ├─ 기존 로그에 정보 있음? ── YES ──→ Metric Filter
   │
   ├─ 즉각 알람 필요? ────── YES ──→ PutMetricData
   │
   └─ 어느 것도 아니면 ────────────→ EMF (default)

"이 메트릭에 어떤 알람을?"
   ├─ 시간대 패턴 있음? ──── YES ──→ Anomaly Detection (2주 데이터 후)
   ├─ 절대 임계값 명확? ──── YES ──→ Static threshold
   ├─ 두 메트릭 비율? ────── YES ──→ Math Expression + threshold
   └─ 여러 조건 AND/OR? ──── YES ──→ Composite Alarm
```

## 정리하며

오늘의 흐름:

- **Metric Filter**: 로그 → 메트릭 (기존 로그를 카운트 메트릭으로, 코드 수정 없이)
- **EMF**: 한 줄 로그에 메트릭 임베드 (API 비용 zero, 메트릭+로그+trace 통합, 가장 비용 효율적)
- **Anomaly Detection**: ML 기반 동적 임계값 (false positive 감소, 단 학습 데이터 누적 후)

운영자는 신규 워크로드 시작 시 다음 순서로 관찰성을 구성한다.

1. EMF로 애플리케이션 메트릭·로그 통합 발행 (PowerTools 사용)
2. AWS 표준 메트릭은 그대로 활용 (EC2/RDS/Lambda 등)
3. 핵심 메트릭(latency p99, error rate)에 Anomaly Detection 알람 (2주 후 활성화)
4. 임계값 명확한 메트릭에 고정 임계값 알람
5. 두 메트릭 비율 알람은 Math Expression
6. 모든 Log Group에 보존 정책 적용
7. Cross-Account는 Observability Access Manager로 통합

내일은 Week 2 복습 + 시나리오 10문제.

---

## 📝 연습 문제

**문제 1.** Metric Filter를 만들었는데 매치가 없을 때 메트릭이 발행되지 않아 알람이 안 울린다. 원인과 해결은?

A) Filter 패턴이 잘못됨
B) `DefaultValue: 0`을 설정해 매치 없을 때 0을 발행. 알람의 `TreatMissingData`도 적절히 설정
C) Log Group 보존 부족
D) Alarm Evaluation Period 부족

**정답: B**
해설: Metric Filter는 매치 시에만 메트릭 발행. 매치 없으면 메트릭 데이터 없음 → 알람의 TreatMissingData에 따라 처리(기본 notBreaching = 정상으로 간주). `DefaultValue: 0`을 설정하면 매치 없을 때도 0이 발행돼 "0건 발생" 상태가 명확. 그 위에서 알람 `>= 1`로 동작.

---

**문제 2.** Anomaly Detection을 신규 메트릭에 즉시 적용하니 모든 데이터가 anomaly로 표시. 원인은?

A) Anomaly Detection은 최소 2일~2주 학습 데이터 필요. 데이터 부족 시 잘못된 베이스라인 생성
B) 메트릭의 dimension이 잘못됨
C) Alarm Evaluation Period 부족
D) High-Resolution이 아니라서

**정답: A**
해설: Anomaly Detection은 최근 2주 데이터로 학습 → 신규 메트릭은 학습 데이터가 없거나 부족해 거의 모든 값이 anomaly. 운영자는 2일~2주 데이터 누적 후 활성화. 학습 기간 동안에도 알람 평가는 되지만 정확도가 낮다.

---

**문제 3.** 운영자가 매일 같은 시간 트래픽 피크가 있고 주말 패턴이 다른 워크로드에서 false positive를 줄이려면?

A) 고정 임계값을 평균 + 표준편차로 설정
B) Anomaly Detection 기반 알람 (시간대·요일 패턴 학습)
C) Composite Alarm으로 여러 알람 조합
D) Math Expression

**정답: B**
해설: Anomaly Detection은 시간대·요일별 패턴을 ML로 학습. 평소 피크는 정상으로 처리, 진짜 이상만 탐지. 매일 같은 시간 피크가 있다는 사실 자체가 Anomaly Detection이 빛나는 상황.

---

**문제 4.** 운영자가 모든 트랜잭션마다 메트릭 5개를 발행해 API 비용이 폭증. 가장 적합한 대안은?

A) PutMetricData를 batch로 묶음
B) EMF로 한 줄 로그에 메트릭 5개 임베드 (API 호출 zero)
C) Custom Logs Insights 쿼리로 매분 계산
D) Metric Filter로 변경

**정답: B**
해설: EMF는 console.log 한 줄로 메트릭 자동 추출. API 호출 비용 zero. PowerTools 라이브러리(Python/Java/TS)가 자동 생성. A는 효과 제한적, C는 latency 증가, D는 기존 로그에서 추출하는 패턴.

---

**문제 5.** 여러 계정의 메트릭과 로그를 한 콘솔에서 보려면?

A) 각 계정 콘솔에 일일이 로그인
B) CloudWatch Cross-Account Observability + Monitoring Account에 Sink, Source 계정에서 자원 연결
C) S3로 모든 로그 export 후 Athena
D) 모든 계정의 IAM Role을 통합

**정답: B**
해설: CloudWatch Observability Access Manager(2022)로 monitoring account에 sink, 각 워크로드 계정에서 source 연결. 한 콘솔에서 전 계정 메트릭/로그/X-Ray trace 통합. Organization 전체 자동 enrollment 옵션.

---

**문제 6.** 운영자가 Lambda 함수의 ERROR / CRITICAL / Exception 로그를 모두 한 메트릭으로 카운트하려고 한다. Metric Filter 패턴은?

A) `"ERROR"` 만
B) `?ERROR ?CRITICAL ?Exception` (OR 패턴)
C) `"ERROR" "CRITICAL" "Exception"` (AND 패턴, 셋 다 포함)
D) Logs Insights만 가능

**정답: B**
해설: Metric Filter의 OR 패턴은 `?` 접두사로 표현. `?ERROR ?CRITICAL ?Exception`은 셋 중 하나라도 포함하면 매치. AND(`"ERROR" "CRITICAL"`)는 둘 다 포함이라 의도와 다름.

---

**문제 7.** Metric Filter를 새로 만들었더니 과거 1주일치 ERROR 로그에 대한 메트릭이 안 잡힌다. 원인과 해결은?

A) Filter 패턴 오류 / 정규식 수정
B) Metric Filter는 forward-only — 새로 도착하는 로그에만 적용. 과거 로그는 Logs Insights로 별도 집계
C) Log Group 보존 부족 / 보존 늘림
D) IAM 권한 부족

**정답: B**
해설: Metric Filter는 ingestion 시점 평가, 과거 로그는 처리 안 함. 새 Filter는 그 시점 이후 도착 로그만 메트릭화. 과거 분석은 Logs Insights로 `stats count(*) by bin(5m)` 같은 쿼리로 별도 진행.

---

**문제 8.** EMF JSON에서 user_id(고 카디널리티)와 service(저 카디널리티)를 동시에 다루는 올바른 방법은?

A) 둘 다 메트릭 dimension에
B) service만 dimension에, user_id는 일반 필드(메타데이터)로 — 메트릭 카디널리티 폭증 회피
C) 둘 다 메트릭 값(value)에
D) EMF로 불가능

**정답: B**
해설: `_aws.CloudWatchMetrics.Dimensions`에는 저 카디널리티 필드(service, env, operation)만. 고 카디널리티 필드(user_id, request_id, trace_id)는 JSON의 일반 필드로만 둠 — 로그 검색은 가능, 메트릭 카디널리티 폭증 없음. EMF의 핵심 설계 의도.
