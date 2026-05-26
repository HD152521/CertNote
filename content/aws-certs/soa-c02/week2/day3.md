# Day 8 - Logs Insights 쿼리 언어: 운영자의 디버깅 SQL

Logs Insights는 CloudWatch Logs 위의 분산 쿼리 엔진이다. 1TB 로그를 30초 안에 스캔하는 이 도구를 운영자가 능숙하게 다루지 못하면, 장애 디버깅에 1시간이 걸리는 일이 5분으로 단축되지 않는다. 오늘은 Insights의 쿼리 문법과 운영자가 매일 쓰는 트러블슈팅 패턴 라이브러리를 만든다.

## Insights 쿼리의 기본 구조

```
fields    @timestamp, @message    ← 출력할 필드 선택
| filter  status_code >= 500       ← 조건 필터
| stats   count(*) by url          ← 집계
| sort    count desc               ← 정렬
| limit   20                       ← 결과 제한
```

이 5개 명령(`fields`, `filter`, `stats`, `sort`, `limit`) + `parse`(정규식으로 메시지에서 필드 추출) + `display`(특정 필드만 표시)가 90% 사용. SQL과 다른 점은 **파이프 방식**이라 단계별 변환이 명확.

## 운영자 트러블슈팅 패턴 라이브러리

### 1. ALB/NLB 5xx 폭증 시 어떤 path가 원인인가

```sql
fields @timestamp, @message
| parse @message /(?<method>\S+)\s+(?<url>\S+)\s+HTTP/
| parse @message /\s(?<status>\d{3})\s/
| filter status >= 500
| stats count(*) as errors by url
| sort errors desc
| limit 20
```

### 2. Lambda 함수의 Cold Start 비율

```sql
fields @timestamp, @message
| filter @type = "REPORT"
| parse @message /Init Duration: (?<initDuration>\S+) ms/
| stats count(*) as total,
        sum(initDuration > 0) as coldStarts,
        (coldStarts / total * 100) as coldStartPct
  by bin(5m)
```

### 3. Lambda 함수의 p99 응답시간 추이

```sql
filter @type = "REPORT"
| stats avg(@duration) as avg,
        pct(@duration, 50) as p50,
        pct(@duration, 95) as p95,
        pct(@duration, 99) as p99
  by bin(5m)
```

### 4. VPC Flow Logs에서 REJECT 트래픽 분석

```sql
fields @message
| parse @message "* * * * * * * * * * * * * *"
  as ver, accId, eni, src, dst, srcPort, dstPort, proto, packets, bytes, start, end, action, log_status
| filter action = "REJECT"
| stats sum(bytes) as totalBytes,
        count_distinct(dst) as uniqueDestinations
  by src
| sort totalBytes desc
| limit 30
```

### 5. CloudTrail에서 IAM 권한 거부 추적

```sql
fields eventTime, eventName, errorCode, errorMessage,
       userIdentity.arn, sourceIPAddress
| filter errorCode = "AccessDenied"
| stats count(*) by userIdentity.arn, eventName
| sort count desc
| limit 50
```

### 6. 특정 사용자의 최근 활동 추적

```sql
fields eventTime, eventName, sourceIPAddress, resources.0.ARN
| filter userIdentity.userName = "intruder-suspect"
| sort eventTime desc
| limit 100
```

### 7. 갑작스러운 Top user_id by request count

```sql
parse @message /user_id=(?<userId>\d+)/
| stats count(*) as requests by userId
| sort requests desc
| limit 30
```

> 🔍 **더 깊이**: `parse` 명령은 정규식이나 glob 패턴(*로 wildcard)으로 메시지에서 필드 추출. 정규식이 정확하지 않으면 매치 실패 → 후속 stats가 빈 결과. 운영자 디버깅 팁: 먼저 `parse` 결과를 `display`로 확인한 후 `stats` 추가.

## Insights 쿼리의 성능과 비용

Insights는 스캔된 GB로 청구($0.0076/GB 서울). 운영자 비용 절감 패턴:

1. **시간 범위 최소화**: 1주일 → 1시간으로 줄이면 비용 168분의 1
2. **`filter`를 앞쪽에**: 스캔 후 필터링이 아니라 스캔 중 필터링
3. **`fields` 명시**: 불필요한 필드 로딩 안 함
4. **인덱스된 필드 활용**: `@timestamp`, `@logStream`은 인덱싱돼 빠름

> 💡 **관련 이론**: Insights는 분산 쿼리 엔진 패턴. 여러 워커가 부분 Log Stream을 스캔하고 결과를 머지. MapReduce/Spark/Presto와 같은 계열. 단 컬럼 지향 저장(Parquet)이 아니라 행 지향(Log line)이라 컬럼 프루닝 효과는 제한적. 시간 분할이 가장 큰 최적화.

## Live Tail: 실시간 모니터링

2023년 출시된 **Live Tail**은 Logs Insights와 달리 실시간 스트리밍. `tail -f` 같은 사용감.

```bash
aws logs start-live-tail \
  --log-group-identifiers arn:aws:logs:ap-northeast-2:111:log-group:/aws/lambda/myfn \
  --log-event-filter-pattern "ERROR"
```

운영자가 배포 직후 실시간 로그를 보거나, 장애 중에 새로 발생하는 에러를 즉시 보고 싶을 때 표준 도구.

## CloudWatch Logs Anomaly Detection

2023년 12월 출시. Log 패턴을 ML로 학습해 비정상 패턴을 자동 탐지.

```
[정상 패턴]
"GET /api/users 200 latency=120ms"  ← 학습됨
"POST /api/orders 201 latency=85ms" ← 학습됨

[이상 패턴 탐지]
"GET /api/users 200 latency=5430ms" ← 알람
"NullPointerException at ..."       ← 알람 (이 패턴 처음 등장)
```

운영자가 수동으로 Metric Filter를 안 만들어도 ML이 자동 베이스라인 학습.

## Embedded Metric Format (EMF): 메트릭과 로그의 통합

운영자가 자주 만나는 패턴: 애플리케이션이 `PutMetricData`로 메트릭 발행하니 API 비용 폭증. 해결책이 EMF.

EMF는 로그 메시지 안에 JSON으로 메트릭을 임베드하면 CloudWatch가 자동으로 메트릭으로 추출.

```json
{
  "_aws": {
    "Timestamp": 1716700000000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp/Orders",
      "Dimensions": [["Service", "Env"]],
      "Metrics": [
        {"Name": "ProcessingLatency", "Unit": "Milliseconds"},
        {"Name": "OrderValue", "Unit": "None"}
      ]
    }]
  },
  "Service": "checkout",
  "Env": "prod",
  "ProcessingLatency": 234,
  "OrderValue": 49.99,
  "user_id": "u-12345",
  "order_id": "o-67890"
}
```

이 JSON을 `console.log`로 한 줄 찍으면:
- CloudWatch Logs에 로그로 저장 (검색 가능)
- ProcessingLatency, OrderValue가 메트릭으로 자동 추출
- user_id, order_id는 메트릭이 아닌 로그 필드(고 카디널리티 문제 회피)

> 📚 **사례**: 한 회사가 모든 HTTP 요청마다 `PutMetricData` 3번 호출하니 API 비용 월 $8,000. EMF로 전환 후 API 비용 zero. 로그 비용은 약간 늘었지만(50% 정도) 메트릭 비용 절감이 압도적. 운영자가 시험에서 "비용 효율적 메트릭 발행"이라는 키워드를 만나면 거의 항상 EMF.

> 🔍 **더 깊이**: EMF는 AWS SDK의 PowerTools(Python, Java, TypeScript)에 통합돼 있다. `from aws_lambda_powertools import Metrics`로 사용 가능. CloudWatch가 EMF JSON을 파싱해 메트릭 발행하는 건 비동기·무료. 단 메트릭이 추출되는 latency는 분 단위.

## CloudWatch Logs Cross-Account Sharing

여러 계정의 로그를 한 계정에서 검색하려면 **Cross-Account 데이터 공유**.

```
[계정 A의 Log Group]
   │ Subscription Filter (Cross-Account)
   ▼
[계정 B의 Kinesis Data Stream]
   │
   └─→ 계정 B에서 검색·분석
```

또는 더 간단히 **CloudWatch Cross-Account Observability** (2022 출시). 여러 계정을 한 콘솔에서 메트릭+로그+trace 통합 조회.

## 정리하며

Logs Insights는 운영자의 SQL. parse + filter + stats 3개 명령으로 90%의 디버깅을 푼다. 시간 범위를 좁게 시작, filter를 앞쪽에 두는 게 비용·속도 핵심. EMF로 메트릭·로그를 통합하면 비용·관찰성 양쪽 다 잡힌다.

내일은 Metric Filter, EMF의 깊이 + Anomaly Detection 운영 패턴.

---

## 📝 연습 문제

**문제 1.** Lambda 함수의 p99 응답시간 추이를 보려면 어떤 쿼리가 정확한가?

A) `filter @type = "REPORT" | stats avg(@duration)`
B) `filter @type = "REPORT" | stats pct(@duration, 99) by bin(5m)`
C) `stats max(@duration)`
D) `parse @message | stats sum(@duration)`

**정답: B**
해설: Lambda REPORT 로그에 @duration 필드 자동 포함. pct() 함수로 백분위수 계산. 시간 빈(bin)으로 추이 분석.

---

**문제 2.** 운영자가 모든 HTTP 요청마다 PutMetricData를 호출해 API 비용이 폭증. 가장 적합한 대안은?

A) 배치 발행
B) Embedded Metric Format (EMF)
C) S3에 메트릭 저장
D) CloudWatch Logs Subscription

**정답: B**
해설: EMF는 로그에 JSON으로 메트릭 임베드, CloudWatch가 자동 메트릭 추출. API 비용 zero.

---

**문제 3.** Insights 쿼리가 1주일 범위에서 너무 느리고 비싸다. 가장 효과적인 개선은?

A) `fields *`로 모든 필드 선택
B) 시간 범위를 좁히고 filter를 앞쪽에 둠
C) `sort` 추가
D) Log Group 자체를 줄임

**정답: B**
해설: Insights 비용은 스캔된 GB. 시간 범위 축소 + filter pushdown이 가장 효과적.

---

**문제 4.** EMF의 핵심 장점은? (2개)

A) PutMetricData API 비용 zero
B) 고 카디널리티 필드(user_id)를 메트릭 dimension으로 사용 가능
C) 메트릭 + 로그를 한 줄로 통합
D) 메트릭 보존 기간이 영구

**정답: A, C**
해설: EMF는 console.log로 한 줄 찍으면 메트릭 자동 추출(API 비용 없음) + 메트릭/로그 통합. 단 고 카디널리티 필드는 dimension에 넣지 말고 로그 필드로만(카디널리티 폭증 방지).
