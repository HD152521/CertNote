# Day 4 - Synthetics Canary, X-Ray Sampling, ServiceLens: User-Centric Monitoring Design

Incidents always follow the saying: "users find out first." In reality, there are many cases where internal metrics look fine but user experience is broken. The reverse is also true—metrics are red while users keep using the service without any problems. If an operator only looks at system internals, it's hard to handle both situations correctly. Today's topics—Synthetics Canary, RUM, X-Ray, and ServiceLens—are tools for setting up monitoring from the "user perspective" rather than from "inside the system."

## Synthetics Canary: History and Design Philosophy of Synthetic Monitoring

"Synthetic" monitoring is a method where a virtual user (bot) executes a predefined scenario without real traffic to measure availability and performance. The concept itself originated in the early 2000s as an "internet measurement" business from companies like Gomez and Keynote. With the arrival of Puppeteer (Google, 2017)—which programmatically controls browsers—realistic synthetic monitoring with browser automation became possible.

CloudWatch Synthetics Canary internally runs **Lambda functions** that execute **Chromium (Puppeteer-based)** or Python scripts. The canary script written by the user runs in the Lambda execution environment, stores execution results (screenshots, HAR files, logs) to S3, and publishes success/failure metrics to the `CloudWatchSynthetics` namespace.

```
[EventBridge Scheduler] → (by rate or cron)
      │
      ▼
[Lambda Execution Environment]
  canary script executes
  Chromium/Python access URL
  validate responses
      │
      ├─→ [S3] screenshots, HAR files, execution logs
      ├─→ [CloudWatch Logs] detailed execution logs
      └─→ [CloudWatch Metrics] SuccessPercent, Duration, Failed
```

## Canary Runtimes and Blueprints

Canary runtimes come in two families: Node.js (Puppeteer-based) and Python. In practice, the selection criterion is primarily the team's language familiarity.

| Runtime | Current Version | Features |
|---------|-----------------|----------|
| `syn-nodejs-puppeteer-7.0` | Latest Node.js | Chromium, Puppeteer, @aws-sdk/client-* |
| `syn-python-selenium-4.1` | Python 3.x | Selenium WebDriver, Chromium |

AWS provides blueprints for quick starts.

| Blueprint | Purpose | Internal Behavior |
|-----------|---------|-------------------|
| **Heartbeat** | Simple ping to check if URL responds with 200 | HTTP GET + status code check |
| **API Canary** | REST API call + validate response body | HTTP method + JSON parsing |
| **Broken Link Checker** | Check all links on a page | Recursive crawling |
| **Visual Monitoring** | Screenshot comparison (detect UI changes) | Pixel diff |
| **Canary Recorder** | Record real browser actions then replay | HAR file replay |
| **GUI Workflow Builder** | Auto-generate code from click/input scenarios | Puppeteer script generation |

The Visual Monitoring Blueprint compares a baseline screenshot with the current screenshot, and considers it a failure if the pixel difference percentage exceeds a threshold. This is useful for automatically detecting layout breaks after UI deployments.

```javascript
// Heartbeat Canary basic structure
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const heartbeat = async function () {
  const page = await synthetics.getPage();

  // 1. Load page
  const response = await page.goto(
    'https://api.example.com/health',
    { waitUntil: 'networkidle0', timeout: 30000 }
  );

  // 2. Validate HTTP status code
  if (response.status() !== 200) {
    throw new Error(`Expected 200, got ${response.status()}`);
  }

  // 3. Validate response body
  const body = await response.json();
  if (body.status !== 'healthy') {
    throw new Error(`Unhealthy: ${JSON.stringify(body)}`);
  }

  // 4. Save screenshot
  await synthetics.takeScreenshot('health-check', 'pass');
  log.info('Health check passed');
};

exports.handler = async () => {
  return await synthetics.executeStep('heartbeat', heartbeat);
};
```

## Comparing Synthetics and RUM: Complementary Perspectives

| Item | Synthetics Canary | CloudWatch RUM |
|------|------------------|----------------|
| Measurement Subject | Virtual user (bot) | Real user browser |
| When No Traffic | Operates (24/7 measurement possible) | No data |
| Regional Diversity | Fixed AWS region execution | All actual user locations |
| Core Web Vitals | Difficult to measure | Auto-measured (LCP, FID, CLS) |
| JavaScript Errors | Script errors only | Real user JS errors |
| Cost | Per canary execution ($0.0012/execution) | By event count |
| Primary Use Case | 24/7 availability, regression detection | UX analysis, performance optimization |

RUM's Core Web Vitals are user experience metrics proposed by Google in 2020. The three key metrics are LCP (Largest Contentful Paint), FID (First Input Delay), and CLS (Cumulative Layout Shift). They also impact Google search rankings, directly affecting SEO.

> 📚 **Case Study**: According to 2019 Amazon research, a 100ms increase in page loading decreases revenue by 1%. Walmart reported a 2% improvement in conversion rate when improving page speed by 1 second. RUM is the data source that connects these business metrics with technical metrics. While Synthetics only measures "the experience of an average bot," RUM measures the actual experience of "a mobile user on LTE from Seoul."

## X-Ray: Internal Structure of Distributed Tracing and Sampling Algorithm

AWS X-Ray traces the flow of requests through multiple services in distributed systems. The foundational concept comes from Google's Dapper paper (Sigelman et al., 2010). Dapper first proposed a hierarchical request tracking structure using `trace_id` and `span_id`, which later became the foundation for Zipkin (Twitter), Jaeger (Uber), and OpenTelemetry. X-Ray implements the same concept adapted for the AWS environment.

**Trace**: The complete path of a single request from creation to completion. Propagated between services via the `X-Amzn-Trace-Id` HTTP header.

**Segment**: The processing period of one service (Lambda, EC2, ECS). Includes start time, end time, error status, and HTTP metadata.

**Subsegment**: Detailed operations within a Segment. SDK calls like DynamoDB queries, S3 uploads, and external API calls are automatically captured as Subsegments.

```
Trace (entire request)
  └─ Segment: API Gateway
      └─ Segment: Lambda order-service
          ├─ Subsegment: DynamoDB GetItem (3ms)
          ├─ Subsegment: SQS SendMessage (8ms)
          └─ Subsegment: HTTPS call to payment-api (245ms)  ← bottleneck!
              └─ Segment: Lambda payment-service
                  └─ Subsegment: RDS Query (230ms)  ← root cause
```

When this tree structure is visualized as a Service Map, you immediately understand which service causes delays.

## X-Ray Sampling Rule: Balancing Cost and Precision

If X-Ray tracked every request, costs would explode with high-volume traffic. At $5 per million traces, a 1000 RPS service with 100% sampling would generate 43.2 million traces per day = $6,480/month X-Ray cost alone. Impractical.

X-Ray Sampling operates on a **Reservoir + Fixed Rate** model. Reservoir is a "bucket" that guarantees "at least N traces per second." Fixed Rate is a percentage applied to additional requests after the Reservoir fills.

```
Default sampling rule:
  Reservoir = 1 (at least 1 per second guaranteed)
  Fixed Rate = 5% (5% of remainder)

Example (100 RPS per second):
  - First 1 request: guaranteed to trace
  - Remaining 99 × 5% = 4.95 ≈ 5 requests
  → Total roughly 6 traces per second = 6% effective sampling rate
```

Custom Sampling Rules can specify different sampling rates by Priority, service name, HTTP method, and URL path.

```bash
# Payment API 100%, health check 0%
aws xray create-sampling-rule \
  --sampling-rule '{
    "RuleName": "payment-api-full",
    "Priority": 1,
    "FixedRate": 1.0,
    "ReservoirSize": 50,
    "ServiceName": "payment-service",
    "ServiceType": "*",
    "Host": "*",
    "HTTPMethod": "POST",
    "URLPath": "/api/v*/payments/*",
    "ResourceARN": "*",
    "Version": 1
  }'

aws xray create-sampling-rule \
  --sampling-rule '{
    "RuleName": "health-check-exclude",
    "Priority": 2,
    "FixedRate": 0.0,
    "ReservoirSize": 0,
    "ServiceName": "*",
    "ServiceType": "*",
    "Host": "*",
    "HTTPMethod": "GET",
    "URLPath": "/health",
    "ResourceARN": "*",
    "Version": 1
  }'
```

Priority 1 matches first. The `/health` endpoint gets Priority 2 rule with 0% sampling (no tracing at all). The default rule has Priority 10000, lower than any user-defined rule.

> 🔍 **Deeper Dive**: The Reservoir size is managed by the X-Ray central sampling service. When one service runs in multiple instances, if each instance independently collects "1 per second," over-collection occurs system-wide. The X-Ray SDK communicates with the central sampling service to distribute the Reservoir. If there are 10 instances, each gets 1/10 of the Reservoir. When network isolation prevents reaching the central service, "fallback sampling (fixed 5%)" applies.

## X-Ray Activation Methods and Differences

| Environment | Activation Method | Notes |
|---------|-------------------|-------|
| Lambda | `tracing-config Mode=Active` | Auto-instrumented, SDK for detailed tracing |
| API Gateway | Stage settings > X-Ray Tracing | Connect API→Lambda trace |
| EC2 | X-Ray Daemon + SDK | Daemon sends traces to X-Ray service |
| ECS | X-Ray Daemon sidecar in Task Definition | Trace propagation between containers |
| EKS | X-Ray Daemon DaemonSet | Pod trace collection |
| App Mesh | Auto-instrumented | Envoy proxy integration |

When Lambda is set to `Mode=Active`, Lambda's own execution time is auto-traced. However, to trace DynamoDB calls inside Lambda as Subsegments, SDK integration is required.

```javascript
const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));  // Auto-capture all AWS SDK calls

const ddb = new AWS.DynamoDB.DocumentClient();
// Now ddb.get(), ddb.put() etc. are auto-traced as X-Ray Subsegments

// Also trace external HTTP calls
const https = AWSXRay.captureHTTPs(require('https'));

// Custom Subsegment
const segment = AWSXRay.getSegment();
const sub = segment.addNewSubsegment('custom-calculation');
try {
  doComplexCalculation();
  sub.close();
} catch (e) {
  sub.addError(e);
  sub.close();
  throw e;
}
```

## ServiceLens: Integrated View of Three Signals

ServiceLens overlays CloudWatch Metrics and Logs on top of the X-Ray Service Map in a unified operations console. It's not an independent service but a view within the CloudWatch console.

Operations enabled by ServiceLens:
- Click Service Map node → see p50/p95/p99 latency and error rate for that service
- Node's "View traces" → actual trace list passing through that service
- Click Trace → all Segments/Subsegments of the trace + timing waterfall
- "View logs" → jump instantly to CloudWatch Logs for that Lambda execution by trace_id
- Alarm overlay → visualize which service has ALARM status

This "Trace ID → Logs jump" feature is the most powerful. You can find a trace of a specific 5xx error and open the Lambda function's execution logs in under a second. Otherwise you'd manually search CloudWatch Logs by request_id.

> 💡 **Related Theory**: ServiceLens implements the concept of **Correlated Telemetry**. Rather than viewing each signal (Metrics, Logs, Traces) independently, you look at the same request/event through different signals and cross-reference them. OpenTelemetry (CNCF, 2019) was born to standardize this correlation. By inserting log_group_name and request_id as correlation attributes into Traces, you can connect data from different storage systems as a single event. AWS provides this correlation through native integration of X-Ray and CloudWatch Logs.

## Container Insights: ECS/EKS-Specific Monitoring

Container Insights is auto-monitoring exclusively for container environments. EKS uses CloudWatch Agent + Fluent Bit as a DaemonSet, and ECS uses awslogs driver or Fluent Bit sidecars.

```bash
# EKS: Enable Container Insights
aws eks update-addon \
  --cluster-name my-cluster \
  --addon-name amazon-cloudwatch-observability \
  --addon-version v1.7.0-eksbuild.1
```

Collected metrics:
- Cluster level: Total CPU/memory utilization, Pod count
- Node level: Per-node CPU/memory/network
- Pod level: Per-pod CPU/memory utilization, restart count
- Container level: Per-container CPU/memory

Auto-generated Performance Dashboards enable hierarchical drill-down from cluster → node → pod → container.

> ⚠️ **Pitfall**: Container Insights incurs additional costs. Billing is based on the number of metrics collected and log volume. Depending on EKS cluster size, tens to hundreds of dollars may be added monthly. It's recommended to review whether you need all container metrics and optimize settings to collect only necessary namespaces.

## Production Architecture: Synthetics + X-Ray + ServiceLens Combination

```
[Synthetics Canary]         [Real Users]
 1-minute heartbeat          RUM JS snippet
 API canary 5-minute          │
       │                     │
       ▼                     ▼
 [CloudWatch Metrics]    [CloudWatch RUM]
 SuccessPercent<90% → ALARM  LCP/CLS/JS errors

       User request
          │
     API Gateway (X-Ray Active)
          │
     Lambda order-service (X-Ray Active)
     ├─ DynamoDB (Subsegment auto)
     └─ SQS (Subsegment auto)
          │
     Lambda payment-service (X-Ray Active)
     └─ RDS (Subsegment auto)
          │
     [X-Ray Service Map → ServiceLens]
     Find error node → Trace → Logs jump instantly
```

## Wrapping Up

Synthetics validates "the service is alive" 24 hours a day. RUM measures "what real users actually experience in terms of performance." X-Ray finds "which service is making it slow" through distributed tracing. ServiceLens integrates these three signals to "open this error trace's Lambda logs" in one click. Each of the four tools has its own domain, and they're most powerful when used together.

---

## 📝 연습 문제

**문제 1.** 새벽 3시에 API가 다운됐는데 트래픽이 없어서 알람이 안 울렸다. 24시간 가용성을 보장하려면?

A) CloudWatch Agent로 메트릭 수집 강화
B) Synthetics Canary로 1분 주기 Heartbeat Canary 구성
C) RUM 스니펫을 더 많은 페이지에 삽입
D) X-Ray 샘플링률을 100%로 올린다

**정답: B**
해설: RUM은 실제 사용자가 없는 새벽엔 데이터가 없다. Synthetics Canary는 합성 사용자가 정해진 주기로 API를 호출하므로 트래픽과 무관하게 24시간 가용성을 측정한다. 1분 주기 Heartbeat Canary가 API 200 응답을 확인하고, 실패 시 `SuccessPercent` 메트릭 알람 → SNS로 즉시 통보한다.

---

**문제 2.** X-Ray Sampling Rule에서 Priority, Reservoir, Fixed Rate의 의미를 올바르게 설명한 것은?

A) Priority가 높을수록 먼저 매칭된다
B) Reservoir는 초당 최소 N개 trace를 보장하는 버킷이고, Fixed Rate는 Reservoir 소진 후 추가 요청에 적용되는 백분율이다. Priority 숫자가 작을수록 먼저 매칭된다
C) Fixed Rate 1.0은 모든 요청의 1% 샘플링이다
D) Reservoir는 분당 최소 N개 trace를 보장한다

**정답: B**
해설: Priority는 낮은 숫자가 높은 우선순위다(Priority 1이 10000보다 먼저 매칭). Reservoir는 초당 최소 N개 trace를 반드시 수집하는 버킷이다. Fixed Rate는 Reservoir가 채워진 후 나머지 요청에 적용되는 비율이다. Fixed Rate 1.0은 100%(전체 샘플링)를 의미한다.

---

**문제 3.** Lambda 함수 내 DynamoDB 쿼리가 X-Ray에서 Subsegment로 보이지 않는다. 이유는?

A) Lambda의 X-Ray Active Tracing이 비활성화됨
B) X-Ray SDK의 `captureAWS()`로 AWS SDK를 감싸지 않았기 때문
C) DynamoDB는 X-Ray 통합을 지원하지 않는다
D) Sampling Rule에서 DynamoDB를 제외했다

**정답: B**
해설: Lambda의 Active Tracing을 켜면 Lambda 실행 자체는 Segment로 추적된다. 그러나 Lambda 내부에서 AWS SDK를 호출할 때 Subsegment로 자동 추적되려면 `const AWS = AWSXRay.captureAWS(require('aws-sdk'))` 또는 v3용 미들웨어를 적용해야 한다. 이 설정 없이는 DynamoDB 호출이 X-Ray에 보이지 않는다.

---

**문제 4.** ServiceLens에서 특정 Lambda의 5xx 에러 trace를 찾았다. CloudWatch Logs에서 해당 실행 로그를 가장 빠르게 보는 방법은?

A) CloudWatch Logs에서 Log Group을 찾아 시간대로 필터링
B) ServiceLens의 Trace 상세에서 "View logs" 링크 클릭 → trace_id로 해당 Lambda 실행 로그로 즉시 점프
C) X-Ray CLI로 trace 상세 조회 후 request_id를 수동으로 찾음
D) CloudTrail에서 Lambda Invoke 이벤트 검색

**정답: B**
해설: ServiceLens의 핵심 기능이 바로 이 "Trace → Logs 점프"다. X-Ray trace에 Lambda request_id가 포함되어 있고, ServiceLens가 이를 활용해 해당 Log Group에서 request_id로 필터링된 로그를 즉시 보여준다. 수동으로 Log Group에서 검색하는 것보다 수십 배 빠르다.

---

**문제 5.** Synthetics Canary가 로그인 → 장바구니 추가 → 결제 완료의 전체 사용자 플로우를 테스트하려 한다. 어떤 Blueprint를 사용하나?

A) Heartbeat
B) API Canary
C) Canary Recorder (실제 브라우저 액션을 기록해 재생)
D) Broken Link Checker

**정답: C**
해설: Canary Recorder는 크롬 확장 프로그램으로 실제 브라우저에서 사용자 액션(클릭, 입력, 이동)을 기록하고, 이를 Puppeteer 스크립트로 변환한다. 복잡한 사용자 플로우를 코드 없이 자동화할 수 있다. Heartbeat는 단순 URL ping, API Canary는 HTTP API 호출, Broken Link Checker는 링크 유효성 검사 전용이다.

---

**문제 6.** X-Ray 비용을 절감하면서도 결제 API는 100% 추적하고 싶다. 가장 적합한 구성은?

A) 모든 서비스의 X-Ray를 비활성화하고 결제만 활성화
B) 기본 샘플링 룰 유지(5%) + 결제 API URL 패턴으로 Priority 1, FixedRate 1.0 Sampling Rule 추가
C) Sampling률을 1%로 낮추고 결제 API만 따로 모니터링 계정에 복사
D) 결제 Lambda에만 CloudWatch 상세 모니터링 활성화

**정답: B**
해설: X-Ray Sampling Rule의 우선순위 매칭을 활용한다. Priority 1로 결제 API URL 패턴(`/api/*/payments/*`)에 FixedRate 1.0(100%)을 설정한다. 다른 요청은 기본 룰(Priority 10000, 5%)이 적용된다. 전체 비용은 줄이면서 중요 트랜잭션은 완전히 추적하는 표준 패턴이다.
