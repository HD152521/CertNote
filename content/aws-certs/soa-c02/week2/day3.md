# Day 8 - Logs Insights 쿼리 언어: 운영자의 디버깅 SQL

Logs Insights는 CloudWatch Logs 위에 얹힌 분산 쿼리 엔진이다. 1TB 로그를 30초 안에 스캔하는 이 도구를 운영자가 능숙하게 다루지 못하면, 장애 디버깅에 1시간이 걸리는 일이 5분으로 단축되지 않는다. 새벽 3시 PagerDuty 알람을 받았을 때 "어떤 path의 어떤 user_id에서 어떤 예외가 났는가"를 다섯 줄 쿼리로 끝내는 운영자와, 콘솔에서 텍스트 검색을 30분 돌리는 운영자의 차이는 결국 Insights를 얼마나 손에 익혔는가다.

오늘은 Insights의 쿼리 문법, 비용·성능 최적화, Live Tail, Logs Anomaly Detection, EMF의 통합까지 운영자가 매일 쓰는 패턴 라이브러리를 만든다.

## Insights 쿼리의 기본 구조

```
fields    @timestamp, @message    ← 출력할 필드 선택
| filter  status_code >= 500       ← 조건 필터
| stats   count(*) by url          ← 집계
| sort    count desc               ← 정렬
| limit   20                       ← 결과 제한
```

이 5개 명령(`fields`, `filter`, `stats`, `sort`, `limit`) + `parse`(정규식 / glob으로 메시지에서 필드 추출) + `display`(특정 필드만 표시) + `dedup`(중복 제거)이 운영자 사용의 95%를 차지. SQL과 다른 점은 **파이프 방식**이라 단계별 변환이 명확하고, 자동 발견되는 필드(예: `@duration`, `@type`, `@billedDuration`)와 사용자 필드를 동시에 다룬다는 것.

### 자동 발견 필드(`@`-prefixed)

| 필드 | 출처 | 의미 |
|------|------|------|
| `@timestamp` | 모든 로그 | 이벤트 시각 |
| `@message` | 모든 로그 | 원본 로그 메시지 |
| `@logStream` | 모든 로그 | 소속 Log Stream 이름 |
| `@log` | 모든 로그 | Log Group ARN |
| `@ingestionTime` | 모든 로그 | 수집 시각 |
| `@duration` | Lambda REPORT | 함수 실행 시간(ms) |
| `@billedDuration` | Lambda REPORT | 청구 시간(ms, 1ms 단위) |
| `@maxMemoryUsed` | Lambda REPORT | 최대 메모리(MB) |
| `@memorySize` | Lambda REPORT | 할당 메모리(MB) |
| `@initDuration` | Lambda REPORT (Cold Start) | 초기화 시간. 콜드 스타트 식별 |
| `@type` | Lambda | START / END / REPORT |
| `@requestId` | Lambda | 요청 추적 |

이 필드들을 알면 Lambda 디버깅 쿼리의 90%가 풀린다.

## 운영자 트러블슈팅 패턴 라이브러리

### 1. ALB/NLB 5xx 폭증 시 어떤 path가 원인인가

```sql
fields @timestamp, @message
| parse @message /(?<method>\S+)\s+(?<url>\S+)\s+HTTP\/(?<httpVer>\S+)\"\s+(?<status>\d{3})/
| filter status >= 500
| stats count(*) as errors,
        count_distinct(@logStream) as instances
  by url, status
| sort errors desc
| limit 20
```

이 쿼리 하나로 "어느 URL에서 어떤 상태 코드가 몇 건, 몇 개 인스턴스에서 났는가"를 즉시 본다. 한 인스턴스만 에러를 내고 있다면 그 인스턴스 문제, 모든 인스턴스에서 균등하게 나면 백엔드(DB·다운스트림) 문제다.

### 2. Lambda 함수의 Cold Start 비율 추이

```sql
filter @type = "REPORT"
| stats count(*) as total,
        sum(strcontains(@message, "Init Duration")) as coldStarts,
        (coldStarts / total * 100) as coldStartPct
  by bin(5m)
| sort @timestamp asc
```

Cold Start 비율이 갑자기 올라가면 (a) 트래픽이 늘어 새 컨테이너가 더 자주 생성, (b) Provisioned Concurrency 부족, (c) 메모리 증설 후 컨테이너 재생성 직후 같은 원인을 의심.

### 3. Lambda p50 / p95 / p99 응답시간 추이

```sql
filter @type = "REPORT"
| stats avg(@duration) as avg,
        pct(@duration, 50) as p50,
        pct(@duration, 95) as p95,
        pct(@duration, 99) as p99,
        max(@duration) as max
  by bin(5m)
| sort @timestamp asc
```

평균만 보면 long tail이 숨는다. p99가 갑자기 올라가면 일부 사용자의 매우 나쁜 경험을 의미. 시험에서 "사용자 일부가 느림" 시나리오는 거의 항상 p99 쿼리가 답.

### 4. Lambda 메모리 사용률 — 메모리 over/under provision 진단

```sql
filter @type = "REPORT"
| stats max(@maxMemoryUsed) as peakMb,
        avg(@maxMemoryUsed) as avgMb,
        max(@memorySize) as allocatedMb,
        (peakMb / allocatedMb * 100) as peakUsagePct
  by @functionName
| filter peakUsagePct < 40 or peakUsagePct > 90
```

`peakUsagePct < 40` → 메모리 over-provision (비용 낭비). 50% 줄여 비용 절감.
`peakUsagePct > 90` → 메모리 부족 (OOM 위험). 메모리 늘려 안정성 확보.

### 5. VPC Flow Logs에서 REJECT 트래픽 분석 — SG/NACL 디버깅

```sql
fields @message
| parse @message "* * * * * * * * * * * * * *"
  as ver, accId, eni, src, dst, srcPort, dstPort, proto, packets, bytes, start, end, action, logStatus
| filter action = "REJECT"
| stats sum(bytes) as totalBytes,
        count(*) as flows,
        count_distinct(dst) as uniqueDestinations,
        count_distinct(dstPort) as uniquePorts
  by src
| sort totalBytes desc
| limit 30
```

이 쿼리로 "어떤 IP가 가장 많이 거부당하고 있는가" 즉시 확인. 봇 스캔이면 거부 IP가 광범위(uniqueDestinations 큼), legit 트래픽이 SG 잘못 설정으로 막힌 거면 좁은 범위(특정 서버 + 특정 포트).

### 6. CloudTrail에서 IAM 권한 거부 패턴

```sql
fields eventTime, eventName, errorCode, errorMessage,
       userIdentity.arn, userIdentity.sessionContext.sessionIssuer.userName,
       sourceIPAddress
| filter errorCode = "AccessDenied" or errorCode = "UnauthorizedOperation"
| stats count(*) as denials,
        count_distinct(eventName) as actions
  by userIdentity.arn, sourceIPAddress
| sort denials desc
| limit 50
```

권한 부족으로 누가 어떤 API를 얼마나 시도하고 있는지 즉시 본다. 짧은 기간 한 사용자에서 다양한 거부가 나오면 침입자 의심, 한 자동화 시스템에서 한 API만 반복 거부면 IAM 정책 누락.

### 7. 특정 사용자의 최근 활동 추적 — 보안 인시던트 대응

```sql
fields eventTime, eventName, sourceIPAddress, awsRegion,
       resources.0.ARN, requestParameters
| filter userIdentity.userName = "intruder-suspect"
   or userIdentity.arn like /intruder-suspect/
| sort eventTime desc
| limit 200
```

침입자 또는 의심 계정의 모든 API 호출을 시간순으로 본다. GuardDuty finding과 함께 사용하는 표준 인시던트 대응 쿼리.

### 8. 갑작스러운 Top user_id by request count — 사용자별 급증 탐지

```sql
parse @message /user_id=(?<userId>[0-9a-f-]+)/
| stats count(*) as requests by userId
| sort requests desc
| limit 30
```

봇·스크래핑·과사용 사용자 식별. EMF 메타데이터 필드로 user_id를 남겨두면 이 쿼리가 즉시 통한다.

### 9. RDS Performance Insights 스타일 — slow query 탐지

```sql
filter @message like /Query_time/
| parse @message /Query_time:\s+(?<qtime>\d+\.\d+)/
| parse @message /SET timestamp=\d+;\s*(?<query>.*?)(?=;|$)/
| filter qtime > 1.0
| stats count(*) as occurrences,
        avg(qtime) as avgSeconds,
        max(qtime) as maxSeconds
  by query
| sort occurrences desc
| limit 20
```

RDS slow query log를 CloudWatch Logs로 받았을 때 1초 이상 걸린 쿼리를 빈도순 정렬.

> 🔍 **더 깊이**: `parse` 명령은 정규식(named capture `(?<name>...)`) 또는 glob 패턴(`*` wildcard)으로 메시지에서 필드 추출. 정규식이 정확하지 않으면 매치 실패 → 후속 stats가 빈 결과. 운영자 디버깅 팁: 먼저 `parse` 결과를 `display` 또는 `fields`로 확인한 후 `stats` 추가. 또 `parse` 후 `filter`에서 추출된 필드가 인식 안 되면 `parse @message ... as ...` 문법을 다시 확인 — 자주 하는 실수가 `parse`의 결과 필드 이름이 자동으로 사용 가능하지 않은 컨텍스트에서 호출되는 경우다.

## Insights 쿼리의 성능과 비용 최적화

Insights는 스캔된 GB로 청구(\$0.0076/GB 서울). 운영자 비용 절감 패턴 5가지:

1. **시간 범위 최소화**: 1주일 → 1시간으로 줄이면 비용 168분의 1. 단계적 확장 — 1시간 → 6시간 → 24시간
2. **`filter`를 가장 앞쪽에**: 스캔 후 필터링이 아니라 스캔 중 필터링. 옵티마이저가 push down
3. **`fields` 명시**: 불필요한 필드 로딩 안 함
4. **인덱스된 필드 우선 활용**: `@timestamp`, `@logStream`, `@log`는 인덱싱돼 빠름
5. **Log Group 좁히기**: 여러 Log Group 한 번에 쿼리 가능하지만 좁힐수록 빠름

```sql
-- 비효율: 모든 필드 로딩, 전체 메시지 스캔
fields @timestamp, @message, @logStream, @ingestionTime, @log
| filter @message like /ERROR/

-- 효율: 필요한 필드만, filter 앞에
fields @timestamp, @message
| filter @message like /ERROR/
```

> 💡 **관련 이론**: Insights는 분산 쿼리 엔진 패턴이다. 여러 워커가 부분 Log Stream을 스캔하고 결과를 머지(MapReduce). 단 컬럼 지향 저장(Parquet)이 아니라 행 지향(Log line) 저장이라 컬럼 프루닝 효과는 제한적. 시간 분할이 가장 큰 최적화. 대량 분석(TB 이상)은 Athena(Parquet 컬럼 저장 + Glue Catalog 파티션)가 압도적으로 빠르고 싸다. 운영자는 "실시간 디버깅 = Insights / 대량 분석 = Athena" 분업이 표준.

## Live Tail: 실시간 모니터링 (2023 출시)

2023년 출시된 **Live Tail**은 Logs Insights와 달리 실시간 스트리밍. `tail -f` 같은 사용감.

```bash
aws logs start-live-tail \
  --log-group-identifiers arn:aws:logs:ap-northeast-2:111:log-group:/aws/lambda/myfn \
  --log-event-filter-pattern "ERROR"
```

운영자가 배포 직후 실시간 로그를 보거나, 장애 중에 새로 발생하는 에러를 즉시 보고 싶을 때 표준 도구. 콘솔에도 "Live Tail" 탭이 있어 GUI로 가능. 단 분당 비용이 발생하므로 (\$0.01/세션·분) 디버깅 후 닫는 게 표준.

## CloudWatch Logs Anomaly Detection (2023 출시)

메트릭의 Anomaly Detection과 다르게 **로그 패턴 자체의 이상**을 ML로 탐지. 처음 보는 패턴, 빈도가 갑자기 변한 패턴을 자동 알림.

```
[정상 학습된 패턴]
"INFO Started processing order=*"
"INFO Order * completed in *ms"
"WARN Retry attempt * for order *"

[이상 탐지]
"FATAL Database connection lost"  ← 처음 보는 패턴, 알람
"INFO Started processing order=*" (빈도 평소의 10배) ← 비정상 빈도, 알람
"java.lang.OutOfMemoryError: Java heap space" ← 새 예외 패턴
```

운영자가 수동 Metric Filter를 안 만들어도 ML이 자동 처리. 단 학습에 최소 며칠~수 주가 필요해 신규 워크로드 즉시 적용은 안 된다. 활성화 후 안정적 베이스라인이 잡힐 때까지 false positive가 있을 수 있다.

> 🔍 **더 깊이**: Logs Anomaly Detection은 내부적으로 **log pattern clustering**(Drain 알고리즘 계열로 추정)으로 비슷한 로그를 하나의 패턴으로 묶은 후, 그 패턴의 빈도·timing의 이상을 STL/ARIMA로 탐지하는 2단 ML 파이프라인. 운영자가 직접 정규식을 안 짜도 ML이 자동으로 "이 로그와 이 로그는 같은 종류"라고 묶어준다.

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
        {"Name": "OrderValue", "Unit": "None"},
        {"Name": "ErrorCount", "Unit": "Count"}
      ]
    }]
  },
  "Service": "checkout",
  "Env": "prod",
  "ProcessingLatency": 234,
  "OrderValue": 49.99,
  "ErrorCount": 0,
  "user_id": "u-12345",
  "order_id": "o-67890",
  "trace_id": "1-5759e988-bd862e3fe1be46a994272793"
}
```

이 JSON을 `console.log`(JavaScript) 또는 `print`(Python)로 한 줄 찍으면:

- CloudWatch Logs에 로그로 저장 (검색 가능)
- ProcessingLatency, OrderValue, ErrorCount가 메트릭으로 자동 추출
- user_id, order_id, trace_id는 메트릭이 아닌 로그 필드(고 카디널리티 문제 회피)
- `PutMetricData` API 호출 0

> 📚 **사례**: 한 회사가 모든 HTTP 요청마다 `PutMetricData`를 3번 호출하니(latency, error_count, order_value) API 비용 월 \$8,000. EMF로 전환 후 API 비용 zero. 로그 비용은 약간 늘었지만(50% 정도) 메트릭 비용 절감이 압도적. 운영자가 시험에서 "비용 효율적 메트릭 발행"이라는 키워드를 만나면 거의 항상 EMF.

> 🔍 **더 깊이**: EMF는 AWS SDK의 **PowerTools**(Python, Java, TypeScript, .NET)에 통합돼 있다. Python의 경우 `from aws_lambda_powertools import Metrics`로 사용. CloudWatch가 EMF JSON을 파싱해 메트릭 발행하는 건 비동기·무료. 단 메트릭이 추출되는 latency는 분 단위(보통 1~2분). 즉각적인 메트릭 반응이 필요한 알람에는 직접 PutMetricData가 더 적합하지만, 그런 경우는 드물다.

## CloudWatch Logs Cross-Account Observability (2022)

여러 계정의 메트릭과 로그를 한 콘솔에서 보려면 **CloudWatch Observability Access Manager**.

```
[Monitoring Account] ← 운영팀이 보는 계정
   │ Sink 활성화
   │
   ├── Source Account A의 메트릭·로그·X-Ray 자동 동기화
   ├── Source Account B
   └── Source Account C
```

운영자 패턴: 별도 모니터링 계정을 만들고 모든 워크로드 계정에서 sink 연결. 운영자는 한 콘솔에서 전 계정 메트릭·로그·X-Ray trace를 통합 조회. Organization 전체를 자동 enrollment하는 옵션도 있어 새 계정이 추가되면 자동 연결된다.

## 정리하며

Logs Insights는 운영자의 SQL이다. `parse + filter + stats` 3개 명령으로 90%의 디버깅을 푼다. 시간 범위를 좁게 시작, filter를 앞쪽에 두는 게 비용·속도 핵심. EMF로 메트릭·로그를 통합하면 비용·관찰성 양쪽 다 잡힌다. 새벽 3시 알람을 받았을 때 위 9개 패턴 라이브러리가 머리에 박혀 있으면 10분 안에 원인을 좁힐 수 있다.

내일은 Metric Filter, EMF 심화 + Anomaly Detection 운영 패턴.

---

## 📝 연습 문제

**문제 1.** Lambda 함수의 p99 응답시간 추이를 5분 단위로 보려면 어떤 쿼리가 정확한가?

A) `filter @type = "REPORT" | stats avg(@duration)`
B) `filter @type = "REPORT" | stats pct(@duration, 99) as p99 by bin(5m)`
C) `stats max(@duration)`
D) `parse @message | stats sum(@duration)`

**정답: B**
해설: Lambda REPORT 라인에 `@duration` 필드가 자동 포함. `pct(@duration, 99)` 함수로 백분위수 계산. `bin(5m)`으로 5분 단위 그룹핑하여 시간 추이 분석. 평균(A)은 long tail 숨김, max(C)은 단일 outlier에 민감.

---

**문제 2.** 운영자가 모든 HTTP 요청마다 PutMetricData를 호출해 API 비용이 폭증했다. 가장 적합한 대안은?

A) PutMetricData를 batch로 묶음
B) Embedded Metric Format (EMF) — console.log 한 줄로 메트릭 자동 추출, API 비용 zero
C) S3에 메트릭 저장 후 매시간 일괄 발행
D) CloudWatch Logs Subscription Filter

**정답: B**
해설: EMF는 로그에 JSON으로 메트릭 임베드, CloudWatch가 자동 메트릭 추출. API 비용 0. PowerTools 라이브러리(Python/Java/TS)가 자동 생성. 시험에서 "비용 효율적 메트릭" 키워드는 거의 항상 EMF.

---

**문제 3.** Insights 쿼리가 1주일 범위에서 너무 느리고 비싸다. 가장 효과적인 개선 순서는?

A) `fields *`로 모든 필드 선택
B) 시간 범위를 좁히고 `filter`를 쿼리 앞쪽에 두고 필요한 `fields`만 명시
C) `sort` 추가
D) Log Group 자체를 줄임

**정답: B**
해설: Insights 비용은 스캔된 GB. 시간 범위 축소 + filter pushdown + 필요한 fields만이 가장 효과적. 1시간 → 6시간 → 24시간 단계적 확장이 표준.

---

**문제 4.** EMF의 핵심 장점 2가지는?

A) PutMetricData API 비용 zero
B) 고 카디널리티 필드(user_id)를 메트릭 dimension으로 자유롭게 사용 가능
C) 메트릭 + 로그를 한 줄 JSON으로 통합. 같은 trace_id로 메트릭 이상치 ↔ 원본 로그 즉시 연결
D) 메트릭 보존 기간이 영구

**정답: A, C**
해설: EMF는 console.log로 한 줄 찍으면 메트릭 자동 추출(API 비용 없음) + 메트릭/로그 통합(같은 JSON 안에 trace_id, user_id 같은 컨텍스트). 고 카디널리티 필드는 dimension에 넣지 말고 로그 필드로만(카디널리티 폭증 방지). 메트릭 보존은 EMF든 PutMetricData든 동일하게 15개월.

---

**문제 5.** Lambda Cold Start 비율을 5분 단위로 추적하는 쿼리는?

A) `filter @message like /COLD/`
B) `filter @type = "REPORT" | stats sum(strcontains(@message, "Init Duration")) / count(*) * 100 as coldPct by bin(5m)`
C) `select cold_start_count from logs`
D) Logs Insights로는 불가, X-Ray 사용

**정답: B**
해설: Lambda REPORT 라인에서 cold start는 `Init Duration:` 텍스트 포함 여부로 판별(웜 스타트엔 없음). `@initDuration` 자동 필드를 활용해 `filter @initDuration > 0 | stats count(*) by bin(5m)`도 가능. 시간 빈으로 비율 추적.

---

**문제 6.** Lambda 함수의 메모리 over-provisioning을 식별하려면?

A) `filter @type = "REPORT" | stats max(@maxMemoryUsed) / max(@memorySize) * 100 as peakPct by @functionName | filter peakPct < 40`
B) X-Ray trace
C) AWS Compute Optimizer (단, 14일 이상 데이터 필요)
D) A와 C 모두 표준 방법

**정답: D**
해설: Insights로 즉각 분석은 A. AWS Compute Optimizer는 14일 이상 데이터 학습 후 자동 추천. 둘 다 표준이며 회사 운영 성숙도에 따라 선택. Compute Optimizer는 SOA-C02에 자주 나오는 관리형 비용 최적화 서비스.

---

**문제 7.** 여러 계정의 메트릭과 로그를 한 콘솔에서 보려면?

A) 각 계정 콘솔에 일일이 로그인
B) CloudWatch Cross-Account Observability + Monitoring Account에 Sink, 각 워크로드 계정에서 Source 연결
C) S3로 모든 로그 export 후 Athena
D) 모든 계정의 IAM Role을 통합

**정답: B**
해설: CloudWatch Observability Access Manager(2022)로 Monitoring Account에 sink, 각 워크로드 계정에서 source 연결. 한 콘솔에서 전 계정 메트릭/로그/X-Ray trace 통합. Organization 전체 자동 enrollment 옵션도 있다.

---

**문제 8.** VPC Flow Logs를 Insights로 분석해 가장 많이 REJECT 당하는 IP를 찾으려면?

A) `filter action = "REJECT" | stats count(*) by srcaddr`
B) `parse @message "* * * * * * * * * * * * * *" as ... | filter action = "REJECT" | stats sum(bytes) by src | sort sum desc`
C) Athena 쿼리
D) X-Ray

**정답: B**
해설: VPC Flow Logs는 space-delimited 텍스트라 `parse`로 필드를 추출해야 한다. 단순 `action = "REJECT"`는 필드명이 자동 인식 안 됨(parse 전엔 @message 안의 한 문자열). 대량 분석이면 S3 + Athena가 더 효율적이지만, Insights 사용 시 정답은 B.
