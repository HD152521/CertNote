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

## 📝 Practice Questions

**Question 1.** The API went down at 3 AM, but no alarm fired because there was no traffic. How can you ensure 24-hour availability monitoring?

A) Strengthen metric collection with the CloudWatch Agent
B) Configure a Heartbeat Canary with a 1-minute schedule using Synthetics Canary
C) Insert the RUM snippet into more pages
D) Raise the X-Ray sampling rate to 100%

**Answer: B**
Explanation: RUM has no data in the early morning when there are no real users. A Synthetics Canary has synthetic users call the API on a set schedule, so it measures availability 24 hours a day regardless of traffic. A Heartbeat Canary on a 1-minute schedule checks for an API 200 response, and on failure the `SuccessPercent` metric alarm notifies immediately via SNS.

---

**Question 2.** Which option correctly explains the meaning of Priority, Reservoir, and Fixed Rate in an X-Ray Sampling Rule?

A) The higher the Priority, the earlier it is matched
B) The Reservoir is a bucket that guarantees at least N traces per second, and the Fixed Rate is the percentage applied to additional requests after the Reservoir is used up. The smaller the Priority number, the earlier it is matched
C) A Fixed Rate of 1.0 means 1% sampling of all requests
D) The Reservoir guarantees at least N traces per minute

**Answer: B**
Explanation: For Priority, a lower number means a higher priority (Priority 1 is matched before 10000). The Reservoir is a bucket that always collects at least N traces per second. The Fixed Rate is the percentage applied to the remaining requests after the Reservoir is filled. A Fixed Rate of 1.0 means 100% (sample everything).

---

**Question 3.** A DynamoDB query inside a Lambda function does not appear as a Subsegment in X-Ray. Why?

A) Active Tracing is disabled on the Lambda function
B) Because the AWS SDK was not wrapped with the X-Ray SDK's `captureAWS()`
C) DynamoDB does not support X-Ray integration
D) DynamoDB was excluded in the Sampling Rule

**Answer: B**
Explanation: If you turn on Active Tracing for Lambda, the Lambda execution itself is traced as a Segment. However, for AWS SDK calls made inside Lambda to be traced automatically as Subsegments, you must apply `const AWS = AWSXRay.captureAWS(require('aws-sdk'))` or the middleware for v3. Without this setup, DynamoDB calls do not appear in X-Ray.

---

**Question 4.** You found a 5xx error trace for a specific Lambda in ServiceLens. What is the fastest way to view that execution's log in CloudWatch Logs?

A) Find the Log Group in CloudWatch Logs and filter by time range
B) In the ServiceLens trace details, click the "View logs" link → jump immediately to that Lambda execution's logs by trace_id
C) Look up the trace details with the X-Ray CLI and find the request_id manually
D) Search for the Lambda Invoke event in CloudTrail

**Answer: B**
Explanation: This "Trace → Logs jump" is exactly the core feature of ServiceLens. The X-Ray trace contains the Lambda request_id, and ServiceLens uses it to immediately show the logs in that Log Group filtered by request_id. It is dozens of times faster than searching the Log Group manually.

---

**Question 5.** A Synthetics Canary needs to test the full user flow of login → add to cart → complete payment. Which Blueprint do you use?

A) Heartbeat
B) API Canary
C) Canary Recorder (records real browser actions and replays them)
D) Broken Link Checker

**Answer: C**
Explanation: The Canary Recorder is a Chrome extension that records user actions (clicks, input, navigation) in a real browser and converts them into a Puppeteer script. It can automate complex user flows without code. Heartbeat is a simple URL ping, API Canary is an HTTP API call, and Broken Link Checker is dedicated to link validity checks.

---

**Question 6.** You want to reduce X-Ray cost while still tracing the payment API at 100%. What is the most appropriate configuration?

A) Disable X-Ray on all services and enable it only for payments
B) Keep the default sampling rule (5%) + add a Sampling Rule with Priority 1 and FixedRate 1.0 matching the payment API URL pattern
C) Lower the sampling rate to 1% and separately copy only the payment API to a monitoring account
D) Enable CloudWatch detailed monitoring only on the payment Lambda

**Answer: B**
Explanation: This uses priority matching of X-Ray Sampling Rules. Set FixedRate 1.0 (100%) with Priority 1 for the payment API URL pattern (`/api/*/payments/*`). Other requests fall under the default rule (Priority 10000, 5%). It is the standard pattern for reducing overall cost while fully tracing critical transactions.
